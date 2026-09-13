#!/usr/bin/env bash
#
# uninstall.sh — Arrêt et/ou désinstallation de SiS AMA.
#
# Usage :
#   sudo bash /opt/sis-ama/deploy/uninstall.sh
#   curl -fsSL https://raw.githubusercontent.com/Teamfliyou/SiS-ama-nouveau/main/deploy/uninstall.sh | sudo bash
#
# SÉCURITÉ : les données PostgreSQL ne sont SUPPRIMÉES qu'après une
# confirmation explicite tapée au clavier. Sans confirmation, seule
# l'arrêt des conteneurs est effectué et le volume est conservé.
#
set -euo pipefail

APP_NAME="SiS AMA"
APP_DIR="/opt/sis-ama"
COMPOSE_FILE="${APP_DIR}/docker-compose.yml"
VOLUME_NAME="sis-ama_postgres_data"

if [ -t 1 ]; then
  C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_BOLD='\033[1m'; C_RST='\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_BOLD=''; C_RST=''
fi

log()  { printf "${C_GREEN}[OK]${C_RST} %s\n" "$*"; }
info() { printf "${C_BOLD}[i]${C_RST} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[!]${C_RST} %s\n" "$*" >&2; }
die()  { printf "${C_RED}[ERR]${C_RST} %s\n" "$*" >&2; exit 1; }

# ─── 1. Vérification root / sudo ───────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  warn "Ce script doit être exécuté en root ou avec sudo."
  die "Relancez avec : sudo bash $(basename "${BASH_SOURCE[0]:-$0}")"
fi

# ─── 2. Dépôt présent ? ────────────────────────────────────────────────
if [ ! -d "$APP_DIR" ]; then
  warn "$APP_DIR n'existe pas."
  die "Rien à désinstaller. Pour supprimer d'éventuels volumes orphelins : docker volume ls | grep postgres_data"
fi

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker n'est pas installé sur cette machine."
  die "Si des données doivent être conservées, aucune action n'a été faite."
fi

run_compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

# ─── 3. Arrêt des conteneurs ───────────────────────────────────────────
info "Les conteneurs sont actuellement :"
run_compose ps || true

read -r -p "${C_BOLD}Arrêter les conteneurs de ${APP_NAME} ? [oui/Entrée pour annuler]${C_RST} " confirm_stop
if [ "$confirm_stop" != "oui" ]; then
  log "Annulation. Aucune modification."
  exit 0
fi

info "Arrêt des conteneurs (les données sont conservées)..."
run_compose down
log "Conteneurs arrêtés. Le volume PostgreSQL '${VOLUME_NAME}' est intact."

# ─── 4. Suppression des données : confirmation EXPLICITE obligatoire ──
warn "IMPORTANT : l'étape suivante SUPPRIME DÉFINITIVEMENT toutes les données"
warn "conservées dans le volume PostgreSQL '${VOLUME_NAME}' (élèves, paiements,"
warn "inscriptions, comptes, historique). Cette action est irréversible."
read -r -p "${C_RED}Taper exactement 'SUPPRIMER' pour effacer les données, sinon Entrée pour conserver${C_RST} " confirm_data

if [ "$confirm_data" = "SUPPRIMER" ]; then
  info "Suppression du volume de données..."
  run_compose down -v
  log "Volume '${VOLUME_NAME}' supprimé."
else
  log "Volume de données conservé."
fi

info "Vous pouvez consulter vos sauvegardes ou reinstaller avec deploy/install.sh."
log "Terminé."