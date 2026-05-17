#!/usr/bin/env bash
# =============================================================================
# OpenFamily — Script d'installation automatique sur Proxmox (conteneur LXC)
# =============================================================================
# A executer sur le HOST Proxmox (pas à l'intérieur d'un conteneur).
#
# Usage :
#   bash proxmox-lxc-install.sh [options]
#
# Options :
#   --id <VMID>          ID du conteneur (défaut : 200)
#   --hostname <name>    Nom d'hôte du conteneur (défaut : openfamily)
#   --storage <pool>     Pool de stockage Proxmox (défaut : local-lvm)
#   --disk <GB>          Taille du disque en Go (défaut : 20)
#   --ram <MB>           RAM en Mo (défaut : 2048)
#   --cores <n>          Nombre de cœurs CPU (défaut : 2)
#   --bridge <br>        Bridge réseau (défaut : vmbr0)
#   --ip <CIDR>          IP statique ex: 192.168.1.50/24 (défaut : dhcp)
#   --gw <IP>            Passerelle (obligatoire si --ip est spécifié)
#   --repo <url>         URL du dépôt git (défaut : dépôt GitHub officiel)
#   --branch <branch>    Branche git (défaut : main)
#   --port-front <p>     Port frontend exposé (défaut : 3000)
#   --port-api <p>       Port API exposée (défaut : 3001)
#   --help               Affiche cette aide
#
# Exemple :
#   bash proxmox-lxc-install.sh --id 210 --hostname openfamily \
#     --ip 192.168.1.50/24 --gw 192.168.1.1 --storage local-lvm
# =============================================================================

set -euo pipefail

# ─── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()   { echo -e "${GREEN}[✓]${NC} $*"; }
info()  { echo -e "${BLUE}[i]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }

# ─── Valeurs par défaut ───────────────────────────────────────────────────────
CT_ID=200
CT_HOSTNAME="openfamily"
CT_STORAGE="local-lvm"
CT_DISK=20
CT_RAM=2048
CT_CORES=2
CT_BRIDGE="vmbr0"
CT_IP="dhcp"
CT_GW=""
CT_TEMPLATE_STORAGE="local"   # là où Proxmox stocke les templates
GIT_REPO="https://github.com/NexaFlowFrance/OpenFamily.git"
GIT_BRANCH="main"
PORT_FRONT=3000
PORT_API=3001
INSTALL_DIR="/opt/openfamily"

# ─── Parsing des arguments ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)       CT_ID="$2";       shift 2 ;;
    --hostname) CT_HOSTNAME="$2"; shift 2 ;;
    --storage)  CT_STORAGE="$2";  shift 2 ;;
    --disk)     CT_DISK="$2";     shift 2 ;;
    --ram)      CT_RAM="$2";      shift 2 ;;
    --cores)    CT_CORES="$2";    shift 2 ;;
    --bridge)   CT_BRIDGE="$2";   shift 2 ;;
    --ip)       CT_IP="$2";       shift 2 ;;
    --gw)       CT_GW="$2";       shift 2 ;;
    --repo)     GIT_REPO="$2";    shift 2 ;;
    --branch)   GIT_BRANCH="$2";  shift 2 ;;
    --port-front) PORT_FRONT="$2"; shift 2 ;;
    --port-api)   PORT_API="$2";   shift 2 ;;
    --help)
      sed -n '4,35p' "$0"
      exit 0 ;;
    *) error "Argument inconnu : $1. Utilisez --help pour l'aide." ;;
  esac
done

# ─── Vérifications préalables ────────────────────────────────────────────────
step "Vérification de l'environnement Proxmox"

if ! command -v pct &>/dev/null; then
  error "Commande 'pct' introuvable. Ce script doit être exécuté sur un hôte Proxmox VE."
fi

if [[ $EUID -ne 0 ]]; then
  error "Ce script doit être exécuté en tant que root."
fi

if pct status "$CT_ID" &>/dev/null; then
  error "Un conteneur avec l'ID $CT_ID existe déjà. Choisissez un autre ID avec --id."
fi

if [[ "$CT_IP" != "dhcp" && -z "$CT_GW" ]]; then
  error "Une passerelle (--gw) est requise quand une IP statique est spécifiée."
fi

log "Environnement Proxmox VE détecté"

# ─── Génération des secrets ──────────────────────────────────────────────────
step "Génération des secrets sécurisés"

gen_secret() {
  tr -dc 'A-Za-z0-9!@#$%^&*()_+' </dev/urandom | head -c "$1"
}
gen_hex() {
  openssl rand -hex "$1"
}

CT_ROOT_PASS=$(gen_hex 16)
POSTGRES_PASSWORD=$(gen_hex 20)
JWT_SECRET=$(gen_hex 32)
# VAPID keys — générés à l'intérieur du conteneur après installation de node
VAPID_SUBJECT="mailto:admin@${CT_HOSTNAME}.local"

log "Secrets générés"

# ─── Résumé avant installation ───────────────────────────────────────────────
step "Résumé de la configuration"
echo -e "
  ID conteneur     : ${BOLD}$CT_ID${NC}
  Hostname         : ${BOLD}$CT_HOSTNAME${NC}
  Stockage         : ${BOLD}$CT_STORAGE${NC}  (disque : ${CT_DISK}GB)
  RAM / CPU        : ${BOLD}${CT_RAM}MB / ${CT_CORES} cœurs${NC}
  Réseau           : ${BOLD}bridge=$CT_BRIDGE  ip=$CT_IP${NC}
  Dépôt git        : ${BOLD}$GIT_REPO${NC}  (branche : $GIT_BRANCH)
  Port frontend    : ${BOLD}$PORT_FRONT${NC}
  Port API         : ${BOLD}$PORT_API${NC}
  Répertoire       : ${BOLD}$INSTALL_DIR${NC}
"
read -r -p "$(echo -e "${YELLOW}Continuer l'installation ? [o/N] : ${NC}")" CONFIRM
[[ "$CONFIRM" =~ ^[oOyY]$ ]] || { info "Installation annulée."; exit 0; }

# ─── Téléchargement du template Debian 12 ────────────────────────────────────
step "Téléchargement du template Debian 12"

TEMPLATE_ID="debian-12-standard_12.7-1_amd64.tar.zst"
TEMPLATE_PATH="${CT_TEMPLATE_STORAGE}:vztmpl/${TEMPLATE_ID}"

if ! pveam list "$CT_TEMPLATE_STORAGE" 2>/dev/null | grep -q "debian-12-standard"; then
  info "Mise à jour de la liste des templates..."
  pveam update
  info "Téléchargement du template Debian 12..."
  pveam download "$CT_TEMPLATE_STORAGE" "$TEMPLATE_ID" \
    || error "Impossible de télécharger le template Debian 12."
else
  TEMPLATE_ID=$(pveam list "$CT_TEMPLATE_STORAGE" 2>/dev/null \
    | grep "debian-12-standard" | sort -r | head -1 | awk '{print $1}' \
    | sed "s|${CT_TEMPLATE_STORAGE}:vztmpl/||")
  TEMPLATE_PATH="${CT_TEMPLATE_STORAGE}:vztmpl/${TEMPLATE_ID}"
  log "Template Debian 12 déjà présent : $TEMPLATE_ID"
fi

# ─── Création du conteneur LXC ───────────────────────────────────────────────
step "Création du conteneur LXC #$CT_ID"

# Construction du paramètre réseau
if [[ "$CT_IP" == "dhcp" ]]; then
  NET_PARAM="name=eth0,bridge=${CT_BRIDGE},ip=dhcp"
else
  NET_PARAM="name=eth0,bridge=${CT_BRIDGE},ip=${CT_IP},gw=${CT_GW}"
fi

pct create "$CT_ID" "$TEMPLATE_PATH" \
  --hostname "$CT_HOSTNAME" \
  --password "$CT_ROOT_PASS" \
  --storage "$CT_STORAGE" \
  --rootfs "${CT_STORAGE}:${CT_DISK}" \
  --memory "$CT_RAM" \
  --cores "$CT_CORES" \
  --net0 "$NET_PARAM" \
  --unprivileged 1 \
  --features "nesting=1" \
  --start 1 \
  --onboot 1

log "Conteneur LXC #$CT_ID créé et démarré"

# Attente que le conteneur soit prêt
info "Attente du démarrage complet du conteneur..."
sleep 5
for i in {1..20}; do
  if pct exec "$CT_ID" -- echo "ready" &>/dev/null 2>&1; then
    break
  fi
  sleep 3
done

# ─── Installation des dépendances dans le conteneur ──────────────────────────
step "Installation des dépendances (Docker, Git, curl...)"

pct exec "$CT_ID" -- bash -s <<'INNER_SETUP'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

# Mise à jour
apt-get update -qq
apt-get upgrade -y -qq

# Dépendances de base
apt-get install -y -qq \
  ca-certificates curl gnupg git openssl jq \
  apt-transport-https lsb-release \
  2>/dev/null

# Docker Engine (dépôt officiel)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

systemctl enable docker
systemctl start docker

# Alias pratique : docker compose (v2) → docker-compose
if ! command -v docker-compose &>/dev/null; then
  ln -s /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null || true
fi

echo "Docker $(docker --version) installé"
INNER_SETUP

log "Docker installé avec succès"

# ─── Clonage du dépôt ────────────────────────────────────────────────────────
step "Clonage du dépôt OpenFamily"

pct exec "$CT_ID" -- bash -c "
  git clone --branch '${GIT_BRANCH}' '${GIT_REPO}' '${INSTALL_DIR}'
  echo 'Dépôt cloné dans ${INSTALL_DIR}'
"

log "Dépôt cloné"

# ─── Génération des clés VAPID ───────────────────────────────────────────────
step "Génération des clés VAPID (notifications push)"

VAPID_KEYS=$(pct exec "$CT_ID" -- bash -c "
  docker run --rm node:20-alpine sh -c \
    'npm install -g web-push --quiet 2>/dev/null && npx web-push generate-vapid-keys --json' \
    2>/dev/null || echo '{\"publicKey\":\"\",\"privateKey\":\"\"}'
") || VAPID_KEYS='{"publicKey":"","privateKey":""}'

VAPID_PUBLIC=$(echo "$VAPID_KEYS"  | grep -o '"publicKey":"[^"]*"'  | cut -d'"' -f4 || true)
VAPID_PRIVATE=$(echo "$VAPID_KEYS" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4 || true)

if [[ -z "$VAPID_PUBLIC" ]]; then
  warn "Génération VAPID échouée (les notifications push seront désactivées)."
  warn "Vous pourrez les configurer plus tard avec : npx web-push generate-vapid-keys"
  VAPID_PUBLIC="VAPID_PUBLIC_A_CONFIGURER"
  VAPID_PRIVATE="VAPID_PRIVATE_A_CONFIGURER"
fi

log "Clés VAPID générées"

# ─── Récupération de l'IP du conteneur ───────────────────────────────────────
CONTAINER_IP=$(pct exec "$CT_ID" -- bash -c \
  "ip -4 addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1" 2>/dev/null || echo "127.0.0.1")

# ─── Création du fichier .env ─────────────────────────────────────────────────
step "Configuration du fichier .env"

pct exec "$CT_ID" -- bash -c "cat > '${INSTALL_DIR}/.env' <<EOF
# ======================================================
# OpenFamily — Configuration générée automatiquement
# Généré le : $(date '+%Y-%m-%d %H:%M:%S')
# ======================================================

# --- Base de données ---
POSTGRES_DB=openfamily
POSTGRES_USER=openfamily
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_PORT=5432

# --- API (backend) ---
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
SERVER_PORT=3001

# --- Notifications push VAPID ---
VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_SUBJECT=${VAPID_SUBJECT}

# --- URLs (adapter si vous utilisez un nom de domaine) ---
CORS_ORIGINS=http://${CONTAINER_IP}:${PORT_FRONT}
VITE_API_URL=http://${CONTAINER_IP}:${PORT_API}
VITE_WS_URL=ws://${CONTAINER_IP}:${PORT_API}
EOF
echo 'Fichier .env créé'
"

log "Fichier .env configuré"

# ─── Adaptation des ports si nécessaire ──────────────────────────────────────
if [[ "$PORT_FRONT" != "3000" || "$PORT_API" != "3001" ]]; then
  step "Adaptation des ports personnalisés"
  pct exec "$CT_ID" -- bash -c "
    sed -i 's/- \"3000:80\"/- \"${PORT_FRONT}:80\"/' '${INSTALL_DIR}/docker-compose.yml'
    sed -i 's/- \"3001:3001\"/- \"${PORT_API}:3001\"/' '${INSTALL_DIR}/docker-compose.yml'
  "
  log "Ports adaptés : frontend=$PORT_FRONT, api=$PORT_API"
fi

# ─── Script de mise à jour ────────────────────────────────────────────────────
step "Installation du script de mise à jour"

pct exec "$CT_ID" -- bash -c "
  cp '${INSTALL_DIR}/scripts/update.sh' '/usr/local/bin/openfamily-update'
  chmod +x '/usr/local/bin/openfamily-update'
  sed -i 's|INSTALL_DIR=.*|INSTALL_DIR=\"${INSTALL_DIR}\"|' '/usr/local/bin/openfamily-update' 2>/dev/null || true
"

# ─── Build et démarrage ───────────────────────────────────────────────────────
step "Build et démarrage des services Docker"

pct exec "$CT_ID" -- bash -c "
  cd '${INSTALL_DIR}'
  docker compose up -d --build 2>&1 | tail -20
  echo 'Services démarrés'
"

# Attente de la santé des services
info "Attente que les services soient opérationnels (jusqu'à 3 min)..."
for i in {1..36}; do
  STATUS=$(pct exec "$CT_ID" -- bash -c \
    "curl -s -o /dev/null -w '%{http_code}' http://localhost:${PORT_API}/health 2>/dev/null || echo '000'")
  if [[ "$STATUS" == "200" ]]; then
    log "API opérationnelle (HTTP 200)"
    break
  fi
  printf "."
  sleep 5
done
echo ""

# ─── Sauvegarde des credentials ──────────────────────────────────────────────
step "Sauvegarde des informations d'accès"

CREDS_FILE="/root/openfamily-credentials-ct${CT_ID}.txt"
cat > "$CREDS_FILE" <<EOF
# ============================================================
# OpenFamily — Informations d'accès (CONFIDENTIEL)
# Conteneur LXC #${CT_ID} — généré le $(date '+%Y-%m-%d %H:%M:%S')
# ============================================================

[Conteneur Proxmox]
  ID              : ${CT_ID}
  Hostname        : ${CT_HOSTNAME}
  IP              : ${CONTAINER_IP}
  Mot de passe root : ${CT_ROOT_PASS}

[Base de données PostgreSQL]
  Base            : openfamily
  Utilisateur     : openfamily
  Mot de passe    : ${POSTGRES_PASSWORD}

[Application]
  JWT_SECRET      : ${JWT_SECRET}
  VAPID Public    : ${VAPID_PUBLIC}
  VAPID Private   : ${VAPID_PRIVATE}

[URLs d'accès]
  Frontend        : http://${CONTAINER_IP}:${PORT_FRONT}
  API             : http://${CONTAINER_IP}:${PORT_API}
  Health check    : http://${CONTAINER_IP}:${PORT_API}/health

[Mise à jour]
  Commande        : pct exec ${CT_ID} -- openfamily-update
  Ou depuis le conteneur : openfamily-update

[Logs]
  pct exec ${CT_ID} -- bash -c "cd ${INSTALL_DIR} && docker compose logs -f"
EOF

chmod 600 "$CREDS_FILE"

# ─── Résumé final ────────────────────────────────────────────────────────────
step "Installation terminée"
echo -e "
${GREEN}${BOLD}OpenFamily est installé et opérationnel !${NC}

  ${BOLD}Frontend${NC}   →  http://${CONTAINER_IP}:${PORT_FRONT}
  ${BOLD}API${NC}        →  http://${CONTAINER_IP}:${PORT_API}/health

  ${BOLD}Credentials${NC} sauvegardés sur l'hôte Proxmox :
             ${CYAN}${CREDS_FILE}${NC}

  ${BOLD}Mise à jour${NC} :
    pct exec ${CT_ID} -- openfamily-update

  ${BOLD}Logs en direct${NC} :
    pct exec ${CT_ID} -- bash -c \"cd ${INSTALL_DIR} && docker compose logs -f\"

  ${BOLD}Shell dans le conteneur${NC} :
    pct enter ${CT_ID}

${YELLOW}Conservez le fichier de credentials en lieu sûr et supprimez-le après lecture.${NC}
"
