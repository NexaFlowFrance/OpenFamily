# OpenFamily in one container: the web interface, the API and PostgreSQL.
# One port, one volume, no secret to prepare:
#
#   docker run -d --name openfamily -p 3000:3000 -v openfamily:/data \
#     ghcr.io/nexaflowfrance/openfamily
#
# docker-compose.yml, with its three containers, stays the install for a server
# that already runs its own PostgreSQL or wants each part on its own.
#
# Build from the root of the repository:
#   docker build -f docker/all-in-one/Dockerfile -t openfamily .

# Build stage, on the machine doing the build: its output (JavaScript, HTML) is
# the same for every architecture. See server/Dockerfile for what emulation cost.
FROM --platform=$BUILDPLATFORM node:26-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

RUN npm ci --include=dev

COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
COPY client ./client

RUN cd shared && npm run build
RUN cd server && npm run build
# Empty: the interface talks to its own origin, and the server below answers
# for both the pages and the API.
ENV VITE_API_URL= VITE_WS_URL=
RUN cd client && npm run build

# Production dependencies, on the target architecture: bcrypt is native.
FROM node:26-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

RUN npm ci --omit=dev --workspace=server --workspace=shared --include-workspace-root \
    && npm cache clean --force

FROM node:26-alpine AS node

# PostgreSQL 16, the version of docker-compose.yml: the data of one install can
# be restored into the other. A later major version cannot read the files of
# this one: changing it here means migrating /data/postgres first.
FROM postgres:16-alpine AS base

# Node.js next to PostgreSQL, with the three libraries its binary links to.
# "node --version" fails the build, not the first start, the day the two base
# images stop sharing an Alpine release the binary can run on.
#
# LLVM goes: a third of the image, for PostgreSQL's JIT compiler alone, which
# speeds up queries far heavier than a family's. PostgreSQL does without it
# when the files are absent, and the entrypoint turns the setting off.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apk add --no-cache libatomic libgcc libstdc++ \
    && node --version \
    && addgroup -S openfamily \
    && adduser -S -D -H -G openfamily openfamily \
    && mkdir -p /data \
    && rm -rf /usr/lib/libLLVM* /usr/lib/llvm* \
        /usr/local/lib/postgresql/llvmjit* /usr/local/lib/postgresql/bitcode

# The files of that stage, without the settings of the PostgreSQL image: it
# declares a volume on /var/lib/postgresql/data, and Docker would create it,
# empty and nameless, at every start, next to the one that holds the data.
FROM scratch

COPY --from=base / /

ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=en_US.utf8 \
    PG_MAJOR=16 \
    PGDATA=/data/postgres \
    NODE_ENV=production

WORKDIR /app

COPY --from=deps /app ./
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

COPY docker/all-in-one/options-to-env.js /usr/local/lib/openfamily/options-to-env.js

# The sed keeps an image built from a Windows checkout from starting on "\r".
COPY docker/all-in-one/entrypoint.sh /usr/local/bin/openfamily-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/openfamily-entrypoint \
    && chmod 755 /usr/local/bin/openfamily-entrypoint

LABEL org.opencontainers.image.title="OpenFamily" \
      org.opencontainers.image.description="Family organizer: calendar, tasks, shopping, meals and budget. Interface, API and PostgreSQL in one container." \
      org.opencontainers.image.source="https://github.com/NexaFlowFrance/OpenFamily" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["openfamily-entrypoint"]
