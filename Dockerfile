FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ jq

RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Remove ignoredBuiltDependencies, overrides, and patchedDependencies that cause issues in Docker
RUN jq 'del(.pnpm.ignoredBuiltDependencies) | del(.pnpm.overrides) | del(.pnpm.patchedDependencies)' package.json > package.json.tmp && \
    mv package.json.tmp package.json

# Delete lock file to regenerate it without the ignored dependencies
RUN rm -f pnpm-lock.yaml

# Install all dependencies including native builds
RUN pnpm install --shamefully-hoist

FROM deps AS builder
WORKDIR /app

# Copy all source code
COPY . .

# Use the modified package.json from deps stage (without ignoredBuiltDependencies)
COPY --from=deps /app/package.json ./package.json

# Build the application
RUN pnpm build

FROM nginx:stable-alpine AS web
COPY --from=builder /app/dist/public /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:20-alpine AS api
WORKDIR /app
COPY --from=builder /app/dist /app/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
