#!/usr/bin/env bash
# One single sign-on round trip against a running stack, playing the browser's
# part with curl: start, provider, callback, exchange, then the session.
# Needs a provider that signs in without a login form (CI uses
# mock-oauth2-server, see docker-compose.ci-sso.yml).
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3001}"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

VERIFIER=$(openssl rand 32 | b64url)
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -binary -sha256 | b64url)

echo "[1/5] Start"
START=$(curl -fsS -X POST "$API_BASE/api/auth/oidc/start" -H 'Content-Type: application/json' \
  -d "{\"clientChallenge\":\"$CHALLENGE\"}")
AUTHORIZE_URL=$(echo "$START" | jq -er '.data.authorizationUrl')

echo "[2/5] Provider"
CALLBACK_URL=$(curl -fsS -o /dev/null -w '%{redirect_url}' "$AUTHORIZE_URL")
[[ "$CALLBACK_URL" == *"/api/auth/oidc/callback?"* ]] || { echo "[FAIL] provider did not redirect to the callback: $CALLBACK_URL"; exit 1; }

echo "[3/5] Callback"
APP_URL=$(curl -sS -o /dev/null -w '%{redirect_url}' "$CALLBACK_URL")
CODE=$(printf '%s' "$APP_URL" | sed -n 's/.*#code=\([A-Za-z0-9_-]*\).*/\1/p')
[[ -n "$CODE" ]] || { echo "[FAIL] callback did not hand over a code: ${APP_URL%%#*}#${APP_URL#*#}"; exit 1; }

echo "[4/5] Exchange"
EXCHANGE=$(curl -fsS -X POST "$API_BASE/api/auth/oidc/exchange" -H 'Content-Type: application/json' \
  -d "{\"code\":\"$CODE\",\"clientVerifier\":\"$VERIFIER\"}")
TOKEN=$(echo "$EXCHANGE" | jq -er '.data.token')

echo "[5/5] Session"
curl -fsS "$API_BASE/api/auth/me" -H "Authorization: Bearer $TOKEN" | jq -e '.data.user.sso_linked == true' >/dev/null
REPLAY=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API_BASE/api/auth/oidc/exchange" -H 'Content-Type: application/json' \
  -d "{\"code\":\"$CODE\",\"clientVerifier\":\"$VERIFIER\"}")
[[ "$REPLAY" == "400" ]] || { echo "[FAIL] a replayed code was accepted ($REPLAY)"; exit 1; }

echo "SSO smoke test passed"
