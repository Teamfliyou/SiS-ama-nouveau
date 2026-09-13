#!/usr/bin/env bash
#
# PostgreSQL restore into an EXISTING database via pg_restore.
#
# Reads the connection string from DATABASE_URL (same one as Prisma). Never
# hardcode credentials here.
#
# IMPORTANT: this overwrites the target database (drops the existing objects
# with --clean). Never run it against a production database you need.
#
# Usage:
#   DATABASE_URL="postgresql://user:password@host:5432/sisama?schema=public" npm run restore -- path/to/sisama-backup-YYYYMMDD.dump
#
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$SERVER_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SERVER_DIR/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Erreur : DATABASE_URL n'est pas définie." >&2
  exit 1
fi

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Usage : $0 <fichier.dump>" >&2
  echo "Exemple : npm run restore -- backups/sisama-backup-20260912.dump" >&2
  exit 1
fi

echo "Restauration de $DUMP_FILE dans la base cible…"
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" "$DUMP_FILE"
echo "Restauration terminée."