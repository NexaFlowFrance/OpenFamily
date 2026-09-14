# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Every workspace manifest plus the lockfile. npm ci needs the complete
# workspace to validate the lockfile, and without the lockfile each build
# resolved whatever versions the registry served that day instead of the ones
# the project tests and audits.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# --include=dev keeps typescript and vite installed even when the build
# environment sets NODE_ENV=production, as many hosting platforms do; without
# it the build stopped at "tsc: not found".
RUN npm ci --include=dev --workspace=client --workspace=shared --include-workspace-root

# Copy source code
COPY shared ./shared
COPY client ./client
COPY tsconfig.json ./

# Build shared and client
RUN cd shared && npm run build
# Empty by default → the web build talks to its own origin and nginx proxies /api
# and /ws to the backend (works from any device). Override only to point the client
# at a SEPARATE API origin/domain.
ARG VITE_API_URL=
ARG VITE_WS_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
# Set to false to hide the "Sign up" link once the family is set up. Read at build
# time by Vite, so changing it requires rebuilding the image.
ARG VITE_REGISTRATION_ENABLED=true
ENV VITE_REGISTRATION_ENABLED=$VITE_REGISTRATION_ENABLED
RUN cd client && npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/client/dist /usr/share/nginx/html

# Copy nginx configuration
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
