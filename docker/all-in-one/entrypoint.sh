#!/usr/bin/env bash
# Starts PostgreSQL, then OpenFamily, in one container, and stops them in the
# reverse order. Everything that must outlive the container is in /data: the
# database, and the secrets made on the first start.
set -Eeuo pipefail

DATA_DIR=/data
SECRETS_FILE="$DATA_DIR/openfamily.env"
PORT=3000

log() { printf '[openfamily] %s\n' "$*"; }
fail() { printf '[openfamily] %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail 'This image starts as root and hands over to unprivileged users by itself. Remove the --user option.'

pg_pid=
node_pid=

alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }

# OpenFamily first: once nothing writes any more, PostgreSQL closes cleanly.
# Docker waits ten seconds before it kills the container; both fit in it.
stop_all() {
    if alive "$node_pid"; then
        kill -TERM "$node_pid" 2>/dev/null || true
        for _ in 1 2 3 4 5; do
            alive "$node_pid" || break
            sleep 1
        done
        kill -KILL "$node_pid" 2>/dev/null || true
    fi
    if alive "$pg_pid"; then
        # SIGINT is PostgreSQL's "fast" shutdown: sessions are closed, data is flushed.
        kill -INT "$pg_pid" 2>/dev/null || true
        wait "$pg_pid" 2>/dev/null || true
    fi
}
trap 'log "Stopping."; stop_all; exit 0' TERM INT

# --- /data ---------------------------------------------------------------------
mkdir -p "$DATA_DIR"
# PostgreSQL runs as its own user and must be able to walk into /data; what is
# private inside (the secrets, the database) carries its own permissions.
chmod 755 "$DATA_DIR"
if [ ! -f "$SECRETS_FILE" ]; then
    (umask 077 && : > "$SECRETS_FILE")
fi
# A folder of the host that refuses a change of owner (some network shares)
# is not a reason to stop here: PostgreSQL has the last word on what it accepts.
chown root:root "$SECRETS_FILE" 2>/dev/null || true
chmod 600 "$SECRETS_FILE" 2>/dev/null || true

# --- settings from Home Assistant ----------------------------------------------------
# Home Assistant gives an app its settings as /data/options.json, where Docker
# gives them with -e. Each line read here is "NAME=value": exported as it is,
# never evaluated.
if [ -f "$DATA_DIR/options.json" ]; then
    while IFS= read -r setting; do
        export "$setting"
    done < <(gosu openfamily node /usr/local/lib/openfamily/options-to-env.js < "$DATA_DIR/options.json" || true)
fi

# --- secrets ---------------------------------------------------------------------
# A value given to the container (-e) wins. Otherwise it is read from /data,
# where it was written the first time it was needed.
stored() { sed -n "s/^$1=//p" "$SECRETS_FILE" | head -n 1; }
remember() { printf '%s=%s\n' "$1" "$2" >> "$SECRETS_FILE"; }
random_hex() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

own_secret() {
    local name=$1 value=${!1:-}
    if [ -z "$value" ]; then
        value=$(stored "$name")
        if [ -z "$value" ]; then
            value=$(random_hex)
            remember "$name" "$value"
        fi
    fi
    printf '%s' "$value"
}

jwt_secret=$(own_secret JWT_SECRET)
postgres_password=$(own_secret POSTGRES_PASSWORD)

# The pair that signs push notifications. Phones subscribe to the public key:
# it must not change between two starts.
vapid_public=${VAPID_PUBLIC_KEY:-}
vapid_private=${VAPID_PRIVATE_KEY:-}
if [ -z "$vapid_public" ] || [ -z "$vapid_private" ]; then
    vapid_public=$(stored VAPID_PUBLIC_KEY)
    vapid_private=$(stored VAPID_PRIVATE_KEY)
    if [ -z "$vapid_public" ] || [ -z "$vapid_private" ]; then
        read -r vapid_public vapid_private < <(
            cd /app/server && gosu openfamily node -e \
                'const keys = require("web-push").generateVAPIDKeys(); console.log(keys.publicKey, keys.privateKey);'
        ) || true
        [ -n "$vapid_public" ] && [ -n "$vapid_private" ] || fail 'Could not make the push notification keys.'
        remember VAPID_PUBLIC_KEY "$vapid_public"
        remember VAPID_PRIVATE_KEY "$vapid_private"
    fi
fi

# --- PostgreSQL ------------------------------------------------------------------
# The entrypoint of the official image creates the database on the first start
# and drops to the postgres user. It listens inside the container only.
export PGDATA="$DATA_DIR/postgres"
export POSTGRES_USER=openfamily POSTGRES_DB=openfamily POSTGRES_PASSWORD="$postgres_password"

if [ -s "$PGDATA/PG_VERSION" ]; then
    found=$(cat "$PGDATA/PG_VERSION")
    [ "$found" = "$PG_MAJOR" ] || fail "The database in /data was made by PostgreSQL $found and this image runs PostgreSQL $PG_MAJOR. Go back to the image you were using; your data is untouched."
else
    log 'First start: creating the database. This takes a moment.'
fi
docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1 -c jit=off &
pg_pid=$!

# PostgreSQL writes its state on line 8 of postmaster.pid. Asking it for a
# connection before that line says "ready" would work too, but each early
# attempt leaves a "FATAL: the database system is starting up" in the log,
# which reads like a failure and is not one.
postgres_ready() {
    [ -f "$PGDATA/postmaster.pid" ] \
        && [ "$(sed -n 8p "$PGDATA/postmaster.pid" | tr -d ' ')" = ready ] \
        && pg_isready -q -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
}

ready=0
for _ in $(seq 1 300); do
    if postgres_ready; then
        ready=1
        break
    fi
    alive "$pg_pid" || fail 'PostgreSQL stopped while starting. Its own messages are just above.'
    sleep 1
done
if [ "$ready" != 1 ]; then
    stop_all
    fail 'PostgreSQL did not answer within five minutes.'
fi

# --- OpenFamily ------------------------------------------------------------------
export NODE_ENV=production
export SERVER_PORT="$PORT"
export SERVE_CLIENT_DIR=/app/client/dist
export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432
export JWT_SECRET="$jwt_secret"
export VAPID_PUBLIC_KEY="$vapid_public" VAPID_PRIVATE_KEY="$vapid_private"

cd /app
gosu openfamily node server/dist/index.js &
node_pid=$!

log "OpenFamily is starting on port $PORT. Open it in a browser and create the first account."

# Whichever of the two stops first takes the container with it, so that
# Docker's restart policy brings both back together.
status=0
wait -n "$pg_pid" "$node_pid" || status=$?
if alive "$node_pid"; then
    log 'PostgreSQL stopped. Stopping OpenFamily.'
else
    log "OpenFamily stopped (code $status). Stopping PostgreSQL."
fi
stop_all
[ "$status" != 0 ] || status=1
exit "$status"
