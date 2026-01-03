#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2025 community-scripts ORG
# Author: NexaFlowFrance
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/NexaFlowFrance/OpenFamily

# Temporary: Use local install script until PR is merged
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/../install/openfamily-install.sh"

APP="OpenFamily"
var_tags="${var_tags:-family;productivity;organization}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-6}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
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

# SSL selection (host-side, interactive)
OPENFAMILY_SSL_MODE="http"
OPENFAMILY_DOMAIN=""
ACME_EMAIL=""

msg_info "HTTPS Configuration (for Notifications / Service Worker)"
echo -e "${TAB}1) HTTP simple (port 3000)"
echo -e "${TAB}2) HTTPS public (Let's Encrypt)"
echo -e "${TAB}3) HTTPS local/LAN (Caddy internal CA)"
read -rp "Choose [1]: " ssl_choice
ssl_choice=${ssl_choice:-1}

if [[ "$ssl_choice" == "2" ]]; then
  OPENFAMILY_SSL_MODE="https_public"
  read -rp "Domain (e.g. openfamily.example.com): " OPENFAMILY_DOMAIN
  if [[ -z "$OPENFAMILY_DOMAIN" ]]; then
    msg_error "Domain is required for HTTPS public"
    exit 1
  fi
  read -rp "ACME email (recommended, optional): " ACME_EMAIL
elif [[ "$ssl_choice" == "3" ]]; then
  OPENFAMILY_SSL_MODE="https_local"
else
  OPENFAMILY_SSL_MODE="http"
fi

# Temporary: Manual installation until script is in official repo
if [[ -f "${INSTALL_SCRIPT}" ]]; then
  msg_info "Installing ${APP} (using local script)"
  pct push "$CTID" "${INSTALL_SCRIPT}" /tmp/openfamily-install.sh
  pct exec "$CTID" -- bash -c "export FUNCTIONS_FILE_PATH=\$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/install.func) && export OPENFAMILY_SSL_MODE='${OPENFAMILY_SSL_MODE}' && export OPENFAMILY_DOMAIN='${OPENFAMILY_DOMAIN}' && export ACME_EMAIL='${ACME_EMAIL}' && bash /tmp/openfamily-install.sh"
  msg_ok "${APP} Installation Complete"
else
  # Use standard method when in official repo
  description
fi

# Get container IP
CONTAINER_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
if [[ "${OPENFAMILY_SSL_MODE}" == "https_public" ]]; then
  echo -e "${TAB}${GATEWAY}${BGN}https://${OPENFAMILY_DOMAIN}${CL}"
elif [[ "${OPENFAMILY_SSL_MODE}" == "https_local" ]]; then
  echo -e "${TAB}${GATEWAY}${BGN}https://${CONTAINER_IP}${CL}"
  echo -e "${TAB}${YW}Note: You must trust Caddy's local CA on your devices to enable Notifications/SW.${CL}"
else
  echo -e "${TAB}${GATEWAY}${BGN}http://${CONTAINER_IP}:3000${CL}"
fi
