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

# --include=dev keeps typescript installed even when the build environment sets
# NODE_ENV=production, as many hosting platforms do; without it the build
# stopped at "tsc: not found".
RUN npm ci --include=dev --workspace=server --workspace=shared --include-workspace-root

# Copy source code
COPY shared ./shared
COPY server ./server
COPY tsconfig.json ./

# Build shared and server
RUN cd shared && npm run build
RUN cd server && npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Production dependencies only, at the versions pinned in the lockfile.
# typescript still lands here: the shared lockfile marks it devOptional because
# i18next (a client dependency) lists it as an optional peer. Do not reach for
# --omit=optional to drop it: that would also drop the optional platform binaries
# some runtime dependencies rely on.
RUN npm ci --omit=dev --workspace=server --workspace=shared --include-workspace-root \
    && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
