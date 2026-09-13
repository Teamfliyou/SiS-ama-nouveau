#!/usr/bin/env bash
#
# install.sh — Déploiement complet de SiS AMA sur un VPS Debian/Ubuntu.
#
# Usage :
#   curl -fsSL https://raw.githubusercontent.com/Teamfliyou/SiS-ama-nouveau/main/deploy/install.sh | sudo bash
#
# Rejouable : relancer le script met à jour l'application sans toucher aux données.
#
# Ce script installe : curl, git, Docker, le plugin Docker Compose, clone la
# branche PostgreSQL de SiS AMA dans /opt/sis-ama, génère les secrets dans
# /opt/sis-ama/.env puis démarre toute la pile avec Docker Compose.
#
set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────
APP_NAME="SiS AMA"
APP_DIR="/opt/sis-ama"
REPO_URL="https://github.com/Teamfliyou/SiS-ama-nouveau"
# Branche contenant la migration PostgreSQL la plus complète.
BRANCH="feature/postgresql-migration"
DB_NAME="sisama"
DB_USER="sisama"
ENV_FILE="${APP_DIR}/.env"
COMPOSE_FILE="${APP_DIR}/docker-compose.yml"

# ─── Couleurs (si stdout est un terminal) ──────────────────────────────
if [ -t 1 ]; then
  C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_BOLD='\033[1m'; C_RST='\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_BOLD=''; C_RST=''
fi

log()   { printf "${C_GREEN}[OK]${C_RST} %s\n" "$*"; }
info()  { printf "${C_BOLD}[i]${C_RST} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[!]${C_RST} %s\n" "$*" >&2; }
die()   { printf "${C_RED}[ERR]${C_RST} %s\n" "$*" >&2; exit 1; }

# ─── 1. Vérification root / sudo ───────────────────────────────────────
# La commande documentée passe par `sudo bash`, le script tourne donc en root.
# Si l'utilisateur lance le script sans privilèges, on l'invite à utiliser sudo.
if [ "$(id -u)" -ne 0 ]; then
  warn "Ce script doit être exécuté en root ou avec sudo."
  if command -v sudo >/dev/null 2>&1; then
    die "Relancez avec : sudo bash $(basename "${BASH_SOURCE[0]:-$0}")  (ou la commande curl | sudo bash du README)."
  fi
  die "sudo n'est pas installé. Connectez-vous en root et relancez le script."
fi

info "Installation de ${APP_NAME}"

# ─── 2. Prérequis : curl, git, Docker, Docker Compose ──────────────────
install_packages() {
  local missing=()
  command -v curl >/dev/null 2>&1 || missing+=(curl)
  command -v git  >/dev/null 2>&1 || missing+=(git)
  command -v openssl >/dev/null 2>&1 || missing+=(openssl)
  if [ "${#missing[@]}" -gt 0 ]; then
    info "Installation des paquets : ${missing[*]}"
    apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
  fi
}

start_docker() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker >/dev/null 2>&1 || true
    systemctl start docker >/dev/null 2>&1 || true
  else
    service docker start >/dev/null 2>&1 || true
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker n'est pas installé — installation via le script officiel get.docker.com..."
  install_packages
  curl -fsSL https://get.docker.com | sh
  start_docker
fi

if ! docker info >/dev/null 2>&1; then
  start_docker
fi

# Plugin Docker Compose (v2). get.docker.com le fournit normalement,
# mais on s'assure qu'il est bien présent.
install_packages
if ! docker compose version >/dev/null 2>&1; then
  info "Installation du plugin Docker Compose..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose est introuvable (apt install docker-compose-plugin)."

docker --version
docker compose version
log "Docker et Docker Compose sont prêts."

# ─── 3. Créer /opt/sis-ama et cloner / mettre à jour la branche ───────
mkdir -p "$APP_DIR"

remote_has_branch() {
  git ls-remote --heads "$REPO_URL" "$BRANCH" | grep -q "$BRANCH"
}

if [ -d "$APP_DIR/.git" ]; then
  info "Le dépôt existe déjà dans $APP_DIR — mise à jour de la branche '$BRANCH'..."
  git -C "$APP_DIR" fetch --quiet origin
  if git -C "$APP_DIR" rev-parse --verify -q "$BRANCH" >/dev/null; then
    git -C "$APP_DIR" checkout --quiet "$BRANCH"
  else
    if remote_has_branch; then
      git -C "$APP_DIR" checkout --quiet -b "$BRANCH" "origin/$BRANCH"
    else
      git -C "$APP_DIR" checkout --quiet main
      git -C "$APP_DIR" pull --ff-only --quiet origin main
      warn "Branche '$BRANCH' absente — utilisation de main."
    fi
  fi
  git -C "$APP_DIR" pull --ff-only --quiet origin "$BRANCH" || \
    die "Mise à jour impossible (modifications locales ?). Résolvez puis relancez."
elif [ -n "$(ls -A "$APP_DIR")" ]; then
  die "$APP_DIR existe mais n'est pas un dépôt git et n'est pas vide. Rien n'a été modifié — déplacez son contenu puis relancez."
else
  info "Clonage de $REPO_URL (branche '$BRANCH')..."
  if remote_has_branch; then
    git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$APP_DIR"
  else
    git clone --quiet "$REPO_URL" "$APP_DIR"
    git -C "$APP_DIR" checkout --quiet main
    warn "Branche '$BRANCH' absente — utilisation de main."
  fi
fi

[ -f "$APP_DIR/docker-compose.yml" ] || die "docker-compose.yml introuvable dans $APP_DIR."

# ─── 4. Générer les secrets dans .env (jamais commités) ────────────────
# Datasources réseau : toutes les machines n'exposent pas port 80/443,
# donc on détecte l'origine publique pour configurer CORS correctement.
detect_host() {
  if [ -n "${DOMAIN:-}" ]; then
    printf 'http://%s' "$DOMAIN"
    return
  fi
  local ip=""
  ip="$(curl -fsSL --connect-timeout 5 https://api.ipify.org 2>/dev/null || true)"
  [ -z "$ip" ] && ip="$(curl -fsSL --connect-timeout 5 https://ifconfig.me 2>/dev/null || true)"
  [ -z "$ip" ] && ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ -n "$ip" ]; then
    printf 'http://%s' "$ip"
  else
    printf 'http://localhost'
  fi
}

secret_or_generate() {
  # $1 = variable, $2 = générateur. Ne réécrit pas une valeur existante.
  local var="$1" gen="$2" value=""
  value="$(grep -E "^${var}=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  if [ -z "$value" ]; then
    value="$($gen)"
    printf '%s=%s\n' "$var" "$value" >> "$ENV_FILE"
  fi
  eval "${var}=\"${value}\""
}

if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  info "Création de $ENV_FILE avec de nouveaux secrets..."
else
  info "$ENV_FILE existe déjà — les secrets sont conservés."
fi
chmod 600 "$ENV_FILE"

# Mot de passe hexadécimal : 100 % compatible avec une URL postgresql://.
secret_or_generate "POSTGRES_PASSWORD" "openssl rand -hex 24"
# JWT secret long et aléatoire.
secret_or_generate "JWT_SECRET" "openssl rand -base64 48"

if ! grep -qE "^FRONTEND_URL=" "$ENV_FILE"; then
  printf 'FRONTEND_URL=%s\n' "$(detect_host)" >> "$ENV_FILE"
fi
FRONTEND_URL="$(grep -E '^FRONTEND_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2-)"

log "Secrets prêts (POSTGRES_PASSWORD, JWT_SECRET, FRONTEND_URL=${FRONTEND_URL})."

# ─── 5. Démarrer / reconstruire la pile ────────────────────────────────
info "Validation de la configuration Docker Compose..."
(
  cd "$APP_DIR"
  docker compose config --quiet
) || die "docker-compose.yml invalide."

info "Build des images et démarrage des conteneurs (docker compose up -d --build)..."
(
  cd "$APP_DIR"
  docker compose up -d --build
)

info "Attente de la fin des migrations (démarrage du backend)..."
(
  cd "$APP_DIR"
  docker compose up -d
  for _ in $(seq 1 30); do
    if docker compose ps --format '{{.Name}} {{.Health}}' 2>/dev/null | grep -q 'backend.*healthy'; then
      break
    fi
    if [ "$(docker compose ps -q backend 2>/dev/null | wc -l)" -eq 0 ]; then
      die "Le conteneur backend ne démarre pas. Consultez : docker compose -f $APP_DIR/docker-compose.yml logs backend"
    fi
    sleep 5
  done
)

log "État des conteneurs :"
(
  cd "$APP_DIR"
  docker compose ps
)

if curl -fsS "${FRONTEND_URL}/api/health" >/dev/null 2>&1; then
  log "${APP_NAME} est en ligne : ${FRONTEND_URL}"
else
  warn "Le healthcheck public n'a pas encore répondu (normal si le domaine/IP n'est pas résolu depuis cette machine)."
  warn "Vérifiez avec : docker compose -f $APP_DIR/docker-compose.yml ps"
  warn "Et :      curl -fsS ${FRONTEND_URL}/api/health"
fi

info "PostgreSQL n'est pas exposé publiquement : seul le port 80 (frontend) est ouvert."
info "Pour mettre à jour plus tard : relancez simplement cette même commande curl."
log "Installation terminée."