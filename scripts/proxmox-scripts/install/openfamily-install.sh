#!/usr/bin/env bash

# Copyright (c) 2021-2025 community-scripts ORG
# Author: NexaFlowFrance
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/NexaFlowFrance/OpenFamily

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt-get install -y \
  curl \
  sudo \
  mc \
  git
msg_ok "Installed Dependencies"

NODE_VERSION="20" NODE_MODULE="pnpm@latest" setup_nodejs
PG_VERSION="17" setup_postgresql

msg_info "Creating PostgreSQL Database"
PG_DB_NAME="openfamily_db"
PG_DB_USER="openfamily"
PG_DB_PASS="$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c13)"

sudo -u postgres psql -c "CREATE ROLE ${PG_DB_USER} WITH LOGIN PASSWORD '${PG_DB_PASS}';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${PG_DB_NAME} WITH OWNER ${PG_DB_USER} ENCODING 'UTF8' TEMPLATE template0;" 2>/dev/null || true
$STD sudo -u postgres psql -c "ALTER ROLE ${PG_DB_USER} SET client_encoding TO 'utf8';"
$STD sudo -u postgres psql -c "ALTER ROLE ${PG_DB_USER} SET default_transaction_isolation TO 'read committed';"
$STD sudo -u postgres psql -c "ALTER ROLE ${PG_DB_USER} SET timezone TO 'UTC';"
msg_ok "Created PostgreSQL Database"

import_local_ip

# SSL mode passed from ct/openfamily.sh (http | https_public | https_local)
OPENFAMILY_SSL_MODE=${OPENFAMILY_SSL_MODE:-http}
OPENFAMILY_DOMAIN=${OPENFAMILY_DOMAIN:-}
ACME_EMAIL=${ACME_EMAIL:-}

msg_info "Downloading OpenFamily from GitHub"
RELEASE=$(curl -fsSL https://api.github.com/repos/NexaFlowFrance/OpenFamily/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
$STD git clone --depth=1 --branch="${RELEASE}" https://github.com/NexaFlowFrance/OpenFamily.git /opt/openfamily
echo "${RELEASE}" > /opt/openfamily_version.txt
msg_ok "Downloaded OpenFamily ${RELEASE}"

msg_info "Configuring OpenFamily"
SESSION_SECRET="$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c32)"

cat <<EOF >/opt/openfamily/server/.env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${PG_DB_NAME}
DB_USER=${PG_DB_USER}
DB_PASSWORD=${PG_DB_PASS}

SESSION_SECRET=${SESSION_SECRET}

NODE_ENV=production
PORT=3000
HOST=${LOCAL_IP}
EOF

# Optional HTTPS reverse proxy (Caddy)
ACCESS_URL="http://${LOCAL_IP}:3000"

if [[ "${OPENFAMILY_SSL_MODE}" == "https_public" || "${OPENFAMILY_SSL_MODE}" == "https_local" ]]; then
  msg_info "Installing Caddy (HTTPS reverse proxy)"
  if ! command -v caddy >/dev/null 2>&1; then
    if ! $STD apt-get install -y caddy; then
      $STD apt-get install -y debian-keyring debian-archive-keyring apt-transport-https gnupg
      curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
      $STD apt-get update
      $STD apt-get install -y caddy
    fi
  fi
  msg_ok "Caddy installed"

  msg_info "Configuring Caddy"
  if [[ "${OPENFAMILY_SSL_MODE}" == "https_public" ]]; then
    if [[ -z "${OPENFAMILY_DOMAIN}" ]]; then
      msg_error "OPENFAMILY_DOMAIN is required for https_public"
      exit 1
    fi
    if [[ -n "${ACME_EMAIL}" ]]; then
      cat <<EOF >/etc/caddy/Caddyfile
{
  email ${ACME_EMAIL}
}

${OPENFAMILY_DOMAIN} {
  reverse_proxy 127.0.0.1:3000
}
EOF
    else
      cat <<EOF >/etc/caddy/Caddyfile
${OPENFAMILY_DOMAIN} {
  reverse_proxy 127.0.0.1:3000
}
EOF
    fi
    ACCESS_URL="https://${OPENFAMILY_DOMAIN}"
  else
    # Local/LAN HTTPS with internal CA
    cat <<EOF >/etc/caddy/Caddyfile
:80 {
  redir https://{host}{uri} permanent
}

https://localhost {
  tls internal
  reverse_proxy 127.0.0.1:3000
}

https://${LOCAL_IP} {
  tls internal
  reverse_proxy 127.0.0.1:3000
}
EOF
    ACCESS_URL="https://${LOCAL_IP}"
  fi

  systemctl enable -q --now caddy
  msg_ok "Caddy configured and started"
fi

cat <<EOF >/root/openfamily.creds
OpenFamily Credentials
======================
Database: ${PG_DB_NAME}
User: ${PG_DB_USER}
Password: ${PG_DB_PASS}
Session Secret: ${SESSION_SECRET}

Access: ${ACCESS_URL}
EOF
msg_ok "Configured OpenFamily"

msg_info "Installing Client Dependencies (Patience)"
cd /opt/openfamily/client
$STD pnpm install
msg_ok "Client dependencies installed"

msg_info "Building Client (Patience)"
$STD pnpm build
msg_ok "Client built"

msg_info "Installing Server Dependencies"
cd /opt/openfamily/server
$STD pnpm install
msg_ok "Server dependencies installed"

msg_info "Initializing Database"
if [ -f /opt/openfamily/server/schema.sql ]; then
  PGPASSWORD=${PG_DB_PASS} psql -U ${PG_DB_USER} -d ${PG_DB_NAME} -h localhost -f /opt/openfamily/server/schema.sql 2>/dev/null || true
fi
msg_ok "Database initialized"

msg_info "Creating Service"
cat <<EOF >/etc/systemd/system/openfamily.service
[Unit]
Description=OpenFamily - Family Organization Platform
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openfamily/dist
Environment=NODE_ENV=production
EnvironmentFile=/opt/openfamily/server/.env
ExecStart=/usr/bin/node /opt/openfamily/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable -q --now openfamily
msg_ok "Service created and started"

motd_ssh
customize
cleanup_lxc

msg_ok "Installation complete!"
msg_info "Database credentials saved to: /root/openfamily.creds"
