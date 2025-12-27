FROM node:18-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN npm i -g pnpm@latest
RUN pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm build

FROM nginx:stable-alpine AS web
COPY --from=builder /app/dist/public /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:18-alpine AS api
WORKDIR /app
COPY --from=builder /app/dist /app/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
