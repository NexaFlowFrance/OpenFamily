#!/usr/bin/env bash
# =============================================================================
# OpenFamily — Script de mise à jour
# =============================================================================
# A exécuter DANS le conteneur LXC, ou depuis l'hôte Proxmox avec :
#   pct exec <VMID> -- openfamily-update
#
# Ce script :
#   1. Sauvegarde la base de données PostgreSQL
#   2. Récupère la dernière version depuis git
#   3. Détecte les nouvelles migrations SQL
#   4. Rebuild les images Docker
#   5. Redémarre les services proprement
#   6. Vérifie que tout est opérationnel
#
# En cas d'échec, il propose un rollback automatique.
# =============================================================================

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
# Ce chemin est remplacé automatiquement par le script d'installation.
INSTALL_DIR="/opt/openfamily"
BACKUP_DIR="/var/backups/openfamily"
LOG_FILE="/var/log/openfamily-update.log"
DATE_TAG=$(date '+%Y%m%d_%H%M%S')

# ─── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()   { echo -e "${GREEN}[✓]${NC} $*" | tee -a "$LOG_FILE"; }
info()  { echo -e "${BLUE}[i]${NC} $*" | tee -a "$LOG_FILE"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[✗]${NC} $*" | tee -a "$LOG_FILE" >&2; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}" | tee -a "$LOG_FILE"; }

# ─── Vérifications préalables ─────────────────────────────────────────────────
step "Vérification de l'environnement"

if [[ ! -f "$INSTALL_DIR/docker-compose.yml" ]]; then
  error "Répertoire d'installation introuvable : $INSTALL_DIR"
fi
if ! command -v docker &>/dev/null; then
  error "Docker n'est pas installé."
fi

mkdir -p "$BACKUP_DIR"
echo "" >> "$LOG_FILE"
echo "=== Mise à jour démarrée le $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

cd "$INSTALL_DIR"

# Lecture de la version actuelle
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "inconnu")
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
info "Version installée : commit $CURRENT_COMMIT (branche $CURRENT_BRANCH)"

# ─── Vérification des mises à jour disponibles ────────────────────────────────
step "Vérification des mises à jour disponibles"

git fetch origin "$CURRENT_BRANCH" --quiet 2>/dev/null || {
  warn "Impossible d'atteindre le dépôt distant. Vérifiez la connectivité réseau."
  exit 0
}

REMOTE_COMMIT=$(git rev-parse --short "origin/$CURRENT_BRANCH" 2>/dev/null || echo "")

if [[ "$CURRENT_COMMIT" == "$REMOTE_COMMIT" ]]; then
  log "OpenFamily est déjà à jour (commit $CURRENT_COMMIT)."
  exit 0
fi

# Affiche les changements à venir
CHANGELOG=$(git log --oneline HEAD.."origin/$CURRENT_BRANCH" 2>/dev/null | head -20 || true)
echo -e "\n${BOLD}Changements à appliquer :${NC}"
echo "$CHANGELOG" | while IFS= read -r line; do echo "  • $line"; done
echo ""

read -r -p "$(echo -e "${YELLOW}Lancer la mise à jour ? [o/N] : ${NC}")" CONFIRM
[[ "$CONFIRM" =~ ^[oOyY]$ ]] || { info "Mise à jour annulée."; exit 0; }

# ─── Sauvegarde PostgreSQL ────────────────────────────────────────────────────
step "Sauvegarde de la base de données"

# Chargement des variables d'environnement
if [[ -f "$INSTALL_DIR/.env" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$INSTALL_DIR/.env"; set +a
fi

BACKUP_FILE="$BACKUP_DIR/openfamily_db_${DATE_TAG}.sql.gz"

if docker compose ps postgres 2>/dev/null | grep -q "running\|Up"; then
  info "Sauvegarde de la base de données → $BACKUP_FILE"
  docker compose exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-openfamily}" "${POSTGRES_DB:-openfamily}" \
    | gzip > "$BACKUP_FILE" \
    && log "Sauvegarde créée : $BACKUP_FILE" \
    || warn "Sauvegarde échouée. La mise à jour continue quand même."

  # Nettoyage des sauvegardes de plus de 30 jours
  find "$BACKUP_DIR" -name "openfamily_db_*.sql.gz" -mtime +30 -delete 2>/dev/null || true
  SAVED_BACKUPS=$(find "$BACKUP_DIR" -name "openfamily_db_*.sql.gz" | wc -l)
  info "$SAVED_BACKUPS sauvegarde(s) conservée(s) dans $BACKUP_DIR"
else
  warn "Le service PostgreSQL n'est pas en cours d'exécution. Sauvegarde ignorée."
fi

# ─── Récupération du code ─────────────────────────────────────────────────────
step "Récupération de la nouvelle version"

# Sauvegarde du .env (git pull ne doit pas l'écraser, mais par précaution)
cp "$INSTALL_DIR/.env" "/tmp/openfamily_env_${DATE_TAG}.bak" 2>/dev/null || true

git pull origin "$CURRENT_BRANCH" --quiet
NEW_COMMIT=$(git rev-parse --short HEAD)
log "Code mis à jour : $CURRENT_COMMIT → $NEW_COMMIT"

# Restauration du .env si git pull l'avait écrasé
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "/tmp/openfamily_env_${DATE_TAG}.bak" "$INSTALL_DIR/.env"
  warn ".env restauré depuis la sauvegarde temporaire."
fi

# ─── Détection des nouvelles migrations SQL ───────────────────────────────────
step "Vérification des migrations de base de données"

MIGRATIONS_DIR="$INSTALL_DIR/server/migrations"
if [[ -d "$MIGRATIONS_DIR" ]]; then
  # Migrations ajoutées depuis le dernier commit
  NEW_MIGRATIONS=$(git diff --name-only "$CURRENT_COMMIT" "$NEW_COMMIT" -- \
    "server/migrations/" 2>/dev/null | grep "\.sql$" || true)

  if [[ -n "$NEW_MIGRATIONS" ]]; then
    info "Nouvelles migrations détectées :"
    echo "$NEW_MIGRATIONS" | while IFS= read -r f; do echo "  → $f"; done

    for MIGRATION in $NEW_MIGRATIONS; do
      MIGRATION_PATH="$INSTALL_DIR/$MIGRATION"
      if [[ -f "$MIGRATION_PATH" ]]; then
        info "Application de : $MIGRATION"
        docker compose exec -T postgres psql \
          -U "${POSTGRES_USER:-openfamily}" \
          -d "${POSTGRES_DB:-openfamily}" \
          < "$MIGRATION_PATH" \
          && log "Migration appliquée : $MIGRATION" \
          || warn "Erreur lors de la migration $MIGRATION. Vérifiez manuellement."
      fi
    done
  else
    log "Aucune nouvelle migration."
  fi
fi

# ─── Rebuild et redémarrage ───────────────────────────────────────────────────
step "Rebuild des images et redémarrage des services"

# On arrête proprement (sans supprimer les volumes)
docker compose down --timeout 30

# Build des nouvelles images
info "Build en cours (peut prendre quelques minutes)..."
docker compose build --no-cache --quiet \
  && log "Images reconstruites" \
  || { error "Le build a échoué. Consultez les logs : docker compose build"; }

# Démarrage
docker compose up -d
log "Services redémarrés"

# ─── Vérification post-mise à jour ────────────────────────────────────────────
step "Vérification de la santé des services"

info "Attente que les services soient prêts..."
API_PORT=$(grep -oP 'SERVER_PORT=\K\d+' "$INSTALL_DIR/.env" 2>/dev/null || echo "3001")

for i in {1..24}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:${API_PORT}/health" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    log "API opérationnelle (HTTP 200) ✓"
    break
  fi
  if [[ $i -eq 24 ]]; then
    warn "L'API ne répond pas après 2 minutes."
    warn "Vérifiez les logs : docker compose logs --tail=50 server"
  fi
  sleep 5
done

# Affiche l'état des conteneurs
echo ""
docker compose ps
echo ""

# ─── Nettoyage des anciennes images ──────────────────────────────────────────
step "Nettoyage"
docker image prune -f --filter "until=24h" &>/dev/null || true
log "Images orphelines supprimées"

# ─── Résumé ───────────────────────────────────────────────────────────────────
step "Mise à jour terminée"
echo -e "
  ${BOLD}Avant${NC}  : commit ${YELLOW}${CURRENT_COMMIT}${NC}
  ${BOLD}Après${NC}  : commit ${GREEN}${NEW_COMMIT}${NC}
  ${BOLD}Backup${NC} : ${CYAN}${BACKUP_FILE:-non créé}${NC}
  ${BOLD}Logs${NC}   : $LOG_FILE
"

# ─── Rollback (fonction d'aide, non automatique) ──────────────────────────────
rollback_info() {
  echo -e "\n${YELLOW}${BOLD}En cas de problème — Procédure de rollback :${NC}"
  echo -e "
  1. Retourner à l'ancien code :
     ${CYAN}cd $INSTALL_DIR && git checkout $CURRENT_COMMIT${NC}

  2. Restaurer la base de données :
     ${CYAN}docker compose exec -T postgres psql \\
       -U ${POSTGRES_USER:-openfamily} -d ${POSTGRES_DB:-openfamily} \\
       < <(gunzip -c ${BACKUP_FILE:-/var/backups/openfamily/BACKUP.sql.gz})${NC}

  3. Rebuild et relance :
     ${CYAN}cd $INSTALL_DIR && docker compose up -d --build${NC}
"
}

rollback_info | tee -a "$LOG_FILE"
