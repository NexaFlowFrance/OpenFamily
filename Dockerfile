FROM node:20-alpine3.21 AS deps
WORKDIR /app

# Update Alpine packages for security
RUN apk update && apk upgrade --no-cache

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ jq

RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Remove only ignoredBuiltDependencies (keep security overrides!)
RUN jq 'del(.pnpm.ignoredBuiltDependencies)' package.json > package.json.tmp && \
    mv package.json.tmp package.json

# Delete lock file to regenerate with security overrides
RUN rm -f pnpm-lock.yaml

# Install with security overrides enforced
RUN pnpm install --shamefully-hoist

# Verify security patches are applied
RUN pnpm ls cross-spawn glob brace-expansion || true

FROM deps AS builder
WORKDIR /app

# Copy all source code
COPY . .

# Use the modified package.json from deps stage (without ignoredBuiltDependencies)
COPY --from=deps /app/package.json ./package.json

# Build the application
RUN pnpm build

FROM nginx:stable-alpine3.21 AS web
RUN apk update && apk upgrade --no-cache
COPY --from=builder /app/dist/public /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:20-alpine3.21 AS api
RUN apk update && apk upgrade --no-cache
WORKDIR /app

# Copy package files and install production dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@latest
RUN pnpm install --prod --frozen-lockfile

# Copy built application
COPY --from=builder /app/dist /app/dist

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
