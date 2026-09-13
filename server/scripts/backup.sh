#!/usr/bin/env bash
#
# PostgreSQL backup via pg_dump (custom-format dump).
#
# Reads the connection string from DATABASE_URL (same one as Prisma), so it
# works on dev, staging and production alike. Never hardcode credentials here.
#
# Usage:
#   DATABASE_URL="postgresql://user:password@host:5432/sisama?schema=public" npm run backup
#   # or, if server/.env already has DATABASE_URL:
#   npm run backup
#
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load server/.env if present (without overriding already-exported variables).
if [ -f "$SERVER_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SERVER_DIR/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Erreur : DATABASE_URL n'est pas définie." >&2
  echo "Exemple : DATABASE_URL='postgresql://user:password@host:5432/sisama?schema=public' npm run backup" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$SERVER_DIR/backups}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/sisama-backup-$STAMP.dump"

echo "Sauvegarde PostgreSQL vers : $OUT_FILE"
pg_dump -Fc "$DATABASE_URL" > "$OUT_FILE"
echo "Sauvegarde terminée."

# Keep only the 30 most recent backups to avoid unbounded disk usage.
ls -1t "$BACKUP_DIR"/sisama-backup-*.dump 2>/dev/null | tail -n +31 | xargs -r rm -f

echo "Dossier de sauvegardes : $BACKUP_DIR"