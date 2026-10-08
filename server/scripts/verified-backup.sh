#!/usr/bin/env bash
set -euo pipefail
umask 077
# Read-only dump of SOURCE_DATABASE_URL, restored ONLY into an empty local DB.
: "${SOURCE_DATABASE_URL:?Source URL required}"
: "${VERIFY_DATABASE_URL:?Empty local verification database URL required}"
: "${BACKUP_FILE:?New backup filename required}"
[[ ! -e "$BACKUP_FILE" ]] || { echo 'Backup file already exists' >&2; exit 1; }
VERIFY_DATABASE_URL="$VERIFY_DATABASE_URL" SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" node <<'JS'
const source = new URL(process.env.SOURCE_DATABASE_URL);
const target = new URL(process.env.VERIFY_DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    decodeURIComponent(target.pathname) !== '/sisama_backup_verify' ||
    (source.hostname === target.hostname && source.port === target.port && source.pathname === target.pathname)) {
  throw new Error('Verification must use a separate local sisama_backup_verify database');
}
JS
tables="$(psql "$VERIFY_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")"
[[ "$tables" == 0 ]] || { echo 'Verification database must be empty; nothing was deleted' >&2; exit 1; }
pg_dump "$SOURCE_DATABASE_URL" --format=custom --file="$BACKUP_FILE"
test -s "$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" > "$BACKUP_FILE.list"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$VERIFY_DATABASE_URL" "$BACKUP_FILE"
psql "$VERIFY_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM "_prisma_migrations";' > "$BACKUP_FILE.migrations"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
echo 'Archive restored successfully into the isolated verification database.'
