#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: NexaFlowFrance
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/NexaFlowFrance/OpenFamily



APP="OpenFamily"
var_tags="${var_tags:-family;productivity;organization}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-6}"
var_os="${var_os:-debian}"
var_version="${var_version:-12}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  
  if [[ ! -d /opt/openfamily ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi
  
  NODE_VERSION="20" NODE_MODULE="pnpm@latest" setup_nodejs
  
  msg_info "Updating ${APP}"
  cd /opt/openfamily
  
  RELEASE=$(curl -fsSL https://api.github.com/repos/NexaFlowFrance/OpenFamily/releases/latest | \
    grep "tag_name" | awk '{print substr($2, 3, length($2)-4)}')
  
  if [[ ! -f /opt/${APP}_version.txt ]] || [[ "${RELEASE}" != "$(cat /opt/${APP}_version.txt)" ]]; then
    msg_info "Updating ${APP} to v${RELEASE}"
    systemctl stop openfamily
    
    $STD git fetch origin
    $STD git checkout "v${RELEASE}"
    
    cd /opt/openfamily/client
    $STD pnpm install
    $STD pnpm build
    
    cd /opt/openfamily/server
    $STD pnpm install
    
    echo "${RELEASE}" > /opt/${APP}_version.txt
    systemctl start openfamily
    
    msg_ok "Updated ${APP} to v${RELEASE}"
  else
    msg_ok "No update required. ${APP} is already at v${RELEASE}"
  fi
  
  exit
}

start
build_container

# Note: build_container will attempt to fetch the official installer from
# community-scripts. Until this script is merged upstream, that fetch may 404.
# We intentionally continue with the bundled local installer below.
msg_custom "INFO" "${YW}" "If you see a 404 for an upstream installer, it's expected (not merged yet). Continuing with local installer."

# SSL selection (host-side, interactive via whiptail)
OPENFAMILY_SSL_MODE="http"
OPENFAMILY_DOMAIN=""
ACME_EMAIL=""

ssl_choice=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
  --title "HTTPS Configuration" \
  --menu "Notifications + Service Worker require HTTPS (except localhost).\n\nChoose HTTPS mode:" 16 74 3 \
  "1" "HTTP simple (port 3000)" \
  "2" "HTTPS public (Let's Encrypt)" \
  "3" "HTTPS local/LAN (local CA download)" \
  3>&1 1>&2 2>&3) || exit_script

if [[ "$ssl_choice" == "2" ]]; then
  OPENFAMILY_SSL_MODE="https_public"
  OPENFAMILY_DOMAIN=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "Public Domain" \
    --inputbox "Domain (e.g. openfamily.example.com):" 10 74 "" \
    3>&1 1>&2 2>&3) || exit_script
  if [[ -z "$OPENFAMILY_DOMAIN" ]]; then
    msg_error "Domain is required for HTTPS public"
    exit 1
  fi
  ACME_EMAIL=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "ACME Email (optional)" \
    --inputbox "Email for Let's Encrypt notifications (recommended, optional):" 10 74 "" \
    3>&1 1>&2 2>&3) || exit_script
elif [[ "$ssl_choice" == "3" ]]; then
  OPENFAMILY_SSL_MODE="https_local"
else
  OPENFAMILY_SSL_MODE="http"
fi

msg_info "Installing ${APP}"

TMP_INSTALL_SCRIPT="$(mktemp)"
cat >"${TMP_INSTALL_SCRIPT}" <<'OPENFAMILY_INSTALL_EOF'
#!/usr/bin/env bash

# Copyright (c) 2021-2025 community-scripts ORG
# Author: NexaFlowFrance
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/NexaFlowFrance/OpenFamily

# Load community-scripts functions
if [[ -n "${FUNCTIONS_FILE_PATH}" ]]; then
  source <(echo "${FUNCTIONS_FILE_PATH}")
fi

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
  git \
  libcap2-bin \
  openssl
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

# Get local IP address
if command -v import_local_ip &>/dev/null; then
  import_local_ip
else
  LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

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
CA_HTTP_URL=""

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
    # Local/LAN HTTPS with a local CA.
    # Goal: avoid user terminal commands; CA is downloadable over plain HTTP.
    # Note: users must still import the CA on each device for browsers to trust it.
    CA_PUBLIC_PATH="/usr/share/caddy/openfamily-local-ca.crt"
    SSL_DIR="/etc/ssl/openfamily"
    CA_KEY_PATH="${SSL_DIR}/openfamily-local-ca.key"
    CA_CRT_PATH="${SSL_DIR}/openfamily-local-ca.crt"
    SRV_KEY_PATH="${SSL_DIR}/openfamily-local.key"
    SRV_CRT_PATH="${SSL_DIR}/openfamily-local.crt"
    mkdir -p "${SSL_DIR}" "/usr/share/caddy"

    msg_info "Generating local CA and certificate"
    # Generate a local CA (10 years)
    openssl genrsa -out "${CA_KEY_PATH}" 2048 >/dev/null 2>&1
    openssl req -x509 -new -nodes -key "${CA_KEY_PATH}" -sha256 -days 3650 \
      -subj "/CN=OpenFamily Local CA" \
      -out "${CA_CRT_PATH}" >/dev/null 2>&1

    # Server cert (SAN includes container IP + openfamily.local)
    openssl genrsa -out "${SRV_KEY_PATH}" 2048 >/dev/null 2>&1
    cat <<EOF >/tmp/openfamily-local-openssl.cnf
[req]
distinguished_name=req_distinguished_name
req_extensions=v3_req
prompt=no

[req_distinguished_name]
CN=openfamily.local

[v3_req]
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=openfamily.local
IP.1=${LOCAL_IP}
IP.2=127.0.0.1
EOF
    openssl req -new -key "${SRV_KEY_PATH}" -out /tmp/openfamily-local.csr -config /tmp/openfamily-local-openssl.cnf >/dev/null 2>&1
    openssl x509 -req -in /tmp/openfamily-local.csr -CA "${CA_CRT_PATH}" -CAkey "${CA_KEY_PATH}" -CAcreateserial \
      -out "${SRV_CRT_PATH}" -days 825 -sha256 -extensions v3_req -extfile /tmp/openfamily-local-openssl.cnf >/dev/null 2>&1
    rm -f /tmp/openfamily-local.csr /tmp/openfamily-local-openssl.cnf "${SSL_DIR}/openfamily-local-ca.srl" >/dev/null 2>&1 || true

    cp -f "${CA_CRT_PATH}" "${CA_PUBLIC_PATH}"
    chmod 0644 "${CA_PUBLIC_PATH}" "${CA_CRT_PATH}" "${SRV_CRT_PATH}" || true

    # Allow the Caddy service user to read the TLS key.
    CADDY_SVC_USER=$(systemctl show -p User --value caddy 2>/dev/null || true)
    CADDY_SVC_GROUP=$(systemctl show -p Group --value caddy 2>/dev/null || true)
    CADDY_SVC_USER=${CADDY_SVC_USER:-caddy}
    CADDY_SVC_GROUP=${CADDY_SVC_GROUP:-${CADDY_SVC_USER}}

    if id -u "${CADDY_SVC_USER}" >/dev/null 2>&1; then
      chown -R "${CADDY_SVC_USER}:${CADDY_SVC_GROUP}" "${SSL_DIR}" || true
      chmod 0750 "${SSL_DIR}" || true
      chmod 0640 "${SRV_KEY_PATH}" || true
      chmod 0600 "${CA_KEY_PATH}" || true
    else
      # Fallback: keep restrictive perms; user may need to adjust if their Caddy runs unprivileged.
      chmod 0600 "${CA_KEY_PATH}" "${SRV_KEY_PATH}" || true
    fi
    CA_HTTP_URL="http://${LOCAL_IP}/openfamily-local-ca.crt"
    msg_ok "Local CA generated"

    cat <<EOF >/etc/caddy/Caddyfile
:80 {
  @openfamily_ca path /openfamily-local-ca.crt
  handle @openfamily_ca {
    root * /usr/share/caddy
    file_server
  }
  handle {
    redir https://{host}{uri} permanent
  }
}

:443 {
  tls ${SRV_CRT_PATH} ${SRV_KEY_PATH}
  reverse_proxy 127.0.0.1:3000
}
EOF

    systemctl enable -q --now caddy
    systemctl restart caddy >/dev/null 2>&1 || true

    if ! systemctl is-active --quiet caddy; then
      msg_error "Caddy failed to start (HTTPS won't work)."
      journalctl -u caddy --no-pager -n 50 2>/dev/null || true
    fi

    if ! ss -ltn 2>/dev/null | grep -qE ':(443)\s'; then
      # Common cause: missing CAP_NET_BIND_SERVICE on the caddy binary.
      if command -v setcap >/dev/null 2>&1; then
        setcap 'cap_net_bind_service=+ep' "$(command -v caddy)" >/dev/null 2>&1 || true
        systemctl restart caddy >/dev/null 2>&1 || true
        sleep 1
      fi

      if ! ss -ltn 2>/dev/null | grep -qE ':(443)\\s'; then
        msg_error "Port 443 is not listening inside the container."
        journalctl -u caddy --no-pager -n 80 2>/dev/null || true
      fi
    fi

    # Self-check: make sure the CA file is actually served over HTTP.
    if ! curl -fsSL "http://127.0.0.1/openfamily-local-ca.crt" >/dev/null 2>&1; then
      msg_error "Caddy is running, but /openfamily-local-ca.crt is not reachable over HTTP."
      msg_error "Check that port 80 is reachable from your LAN and that Caddy is listening on :80."
    fi

    ACCESS_URL="https://${LOCAL_IP}"
    msg_ok "Caddy configured and started"
  fi

  if [[ "${OPENFAMILY_SSL_MODE}" == "https_public" ]]; then
    systemctl enable -q --now caddy
    msg_ok "Caddy configured and started"
  fi
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

if [[ "${OPENFAMILY_SSL_MODE}" == "https_local" && -n "${CA_HTTP_URL}" ]]; then
  cat <<EOF >>/root/openfamily.creds

Local HTTPS notes
----------------
To trust the local Caddy CA on your device, download:
${CA_HTTP_URL}
Then import it as a trusted CA on PC/mobile.
EOF
fi

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
OPENFAMILY_INSTALL_EOF

pct push "$CTID" "${TMP_INSTALL_SCRIPT}" /tmp/openfamily-install.sh
rm -f "${TMP_INSTALL_SCRIPT}" || true

# Download functions file inside container and execute installation
pct exec "$CTID" -- bash -c "
  export FUNCTIONS_FILE_PATH=\"\$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/install.func)\"
  export OPENFAMILY_SSL_MODE='${OPENFAMILY_SSL_MODE}'
  export OPENFAMILY_DOMAIN='${OPENFAMILY_DOMAIN}'
  export ACME_EMAIL='${ACME_EMAIL}'
  bash /tmp/openfamily-install.sh
"
msg_ok "${APP} Installation Complete"

# Get container IP
CONTAINER_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
if [[ "${OPENFAMILY_SSL_MODE}" == "https_public" ]]; then
  echo -e "${TAB}${GATEWAY}${BGN}https://${OPENFAMILY_DOMAIN}${CL}"
elif [[ "${OPENFAMILY_SSL_MODE}" == "https_local" ]]; then
  echo -e "${TAB}${GATEWAY}${BGN}https://${CONTAINER_IP}${CL}"
  echo -e "${TAB}${YW}Votre navigateur va bloquer tant que la CA de Caddy n'est pas approuvée.${CL}"
  echo -e "${TAB}${YW}Téléchargez la CA (sans terminal) :${CL}"
  echo -e "${TAB}${BGN}http://${CONTAINER_IP}/openfamily-local-ca.crt${CL}"
  echo -e "${TAB}${YW}Puis importez-la comme Autorité de confiance sur PC/mobile.${CL}"
  echo -e "${TAB}${YW}(Temporaire) Accès HTTP sans notifications: http://${CONTAINER_IP}:3000${CL}"
else
  echo -e "${TAB}${GATEWAY}${BGN}http://${CONTAINER_IP}:3000${CL}"
fi
