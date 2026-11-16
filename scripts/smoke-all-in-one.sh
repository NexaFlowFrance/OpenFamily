#!/usr/bin/env bash
# The all-in-one image, started the way its one-line install starts it: a port,
# a volume, nothing else. It must serve the pages and the API, and keep the
# accounts and their sessions when the container is replaced, as an update does.
#
#   docker build -f docker/all-in-one/Dockerfile -t openfamily:smoke .
#   bash scripts/smoke-all-in-one.sh openfamily:smoke
set -euo pipefail

IMAGE="${1:-openfamily:smoke}"
NAME="openfamily-smoke"
VOLUME="openfamily-smoke-data"
PORT="${SMOKE_PORT:-3900}"
BASE="http://localhost:$PORT"
HERE="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
fail() {
  echo "[FAIL] $1"
  docker logs --tail=120 "$NAME" 2>&1 || true
  exit 1
}
trap cleanup EXIT
cleanup

start() {
  docker run -d --name "$NAME" -p "$PORT:3000" -v "$VOLUME:/data" "$IMAGE" >/dev/null
  for _ in $(seq 1 90); do
    if curl -fsS "$BASE/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  fail "the container did not answer on /health"
}

echo "[1/5] First start, on an empty volume"
start

echo "[2/5] One volume, and the interface on the same port as the API"
[ "$(docker inspect "$NAME" --format '{{len .Mounts}}')" = 1 ] || fail "the container has more than its one volume"
# Answers are read into variables before they are searched: with pipefail, a
# grep that has found its line and left closes the pipe on the command feeding
# it, and the check fails for having succeeded early.
PAGE=$(curl -fsS "$BASE/")
case "$PAGE" in *'<div id="root">'*) ;; *) fail "the interface is not served" ;; esac
DEEP=$(curl -fsS "$BASE/calendar")
case "$DEEP" in *'<div id="root">'*) ;; *) fail "an address of the app opened directly does not give the app" ;; esac
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/nope")" = 404 ] || fail "an unknown API address is not a 404"
# The page is checked again at every visit, or an update would not be seen;
# the files it loads are named after their content and kept for good.
PAGE_HEADERS=$(curl -fsSI "$BASE/")
grep -qi '^cache-control: no-cache' <<< "$PAGE_HEADERS" || fail "the page may be kept by the browser across an update"
[[ "$PAGE" =~ (/assets/[^\"]*\.js) ]] || fail "the page loads no built script"
ASSET_HEADERS=$(curl -fsSI "$BASE${BASH_REMATCH[1]}")
grep -qi '^cache-control:.*immutable' <<< "$ASSET_HEADERS" || fail "the built files are not cached for good"

echo "[3/5] The API"
API_BASE="$BASE" bash "$HERE/smoke-api.sh"

echo "[4/5] An account, and its session"
EMAIL="aio-$(date +%s)-$RANDOM@example.com"
TOKEN=$(curl -fsS -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest123!\",\"name\":\"All in one\",\"timezone\":\"America/Montreal\"}" | jq -r '.data.token')
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || fail "no session for the new account"
ZONE=$(curl -fsS "$BASE/api/auth/timezone" -H "Authorization: Bearer $TOKEN" | jq -r '.data.family_timezone')
[ "$ZONE" != "null" ] || fail "the family did not take the time zone sent with the sign-up"

echo "[5/5] A new container on the same volume"
docker stop "$NAME" >/dev/null
[ "$(docker inspect "$NAME" --format '{{.State.ExitCode}}')" = 0 ] || fail "the container did not stop cleanly"
# The last thing a clean stop leaves in the log. Read into a variable, not
# through a pipe: the first start also writes this line, early on, and a grep
# that stops at it would close the pipe on "docker logs" and fail the check.
LAST_LINES=$(docker logs --tail=3 "$NAME" 2>&1)
case "$LAST_LINES" in
  *"database system is shut down"*) ;;
  *) fail "PostgreSQL was not shut down cleanly" ;;
esac
docker rm "$NAME" >/dev/null
start
# The session was signed with a secret made on the first start: it is only
# still good if that secret was kept, and the account with it.
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")" = 200 ] \
  || fail "the session did not survive the new container"

echo "[OK] all-in-one image"
