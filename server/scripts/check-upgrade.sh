#!/usr/bin/env bash
set -euo pipefail
# GitHub Actions uses a fresh disposable PostgreSQL service, never the live DB.
: "${PRODUCTION_BASE_SHA:?Production base commit required}"
: "${PGUSER:?Test PGUSER required}"
: "${PGPASSWORD:?Test PGPASSWORD required}"
[[ "${PGHOST:-}" == localhost && "$PGUSER" == sisama_test ]] || exit 1
upgrade_url="postgresql://${PGUSER}:${PGPASSWORD}@localhost:5432/sisama_upgrade_test?schema=public"
createdb sisama_upgrade_test
upgrade_dir="$(mktemp -d)"
trap 'rm -rf "$upgrade_dir"' EXIT
git archive "$PRODUCTION_BASE_SHA" server/prisma | tar -x -C "$upgrade_dir"
DATABASE_URL="$upgrade_url" npx --no-install prisma migrate deploy --schema "$upgrade_dir/server/prisma/schema.prisma"
psql -d sisama_upgrade_test -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Family" ("name", "updatedAt") VALUES ('Fixture family', NOW());
INSERT INTO "Class" ("name", "tuitionFeeCents", "updatedAt") VALUES ('Fixture class', 15000, NOW());
INSERT INTO "Student" ("firstName", "lastName", "dateOfBirth", "classId", "familyId", "updatedAt")
VALUES ('Fixture', 'Student', '2017-03-12', 1, 1, NOW());
INSERT INTO "PaymentGroup" ("method", "subtotalCents", "discountCents", "totalCents")
VALUES ('CASH', 15000, 1500, 13500);
INSERT INTO "Payment" ("amountCents", "discountCents", "studentId", "groupId", "updatedAt")
VALUES (13500, 1500, 1, 1, NOW());
SQL
fingerprint_sql='SELECT md5(row_to_json(s)::text) FROM (SELECT s."id", s."firstName", s."lastName", s."dateOfBirth", s."classId", s."familyId", p."amountCents", p."discountCents", p."method", p."groupId", g."totalCents" FROM "Student" s JOIN "Payment" p ON p."studentId"=s."id" JOIN "PaymentGroup" g ON g."id"=p."groupId" ORDER BY s."id", p."id") s;'
before="$(psql -d sisama_upgrade_test -At -v ON_ERROR_STOP=1 -c "$fingerprint_sql")"
DATABASE_URL="$upgrade_url" npx --no-install prisma migrate deploy
after="$(psql -d sisama_upgrade_test -At -v ON_ERROR_STOP=1 -c "$fingerprint_sql")"
[[ -n "$before" && "$before" == "$after" ]]
DATABASE_URL="$upgrade_url" npx --no-install prisma migrate diff --from-url "$upgrade_url" --to-schema-datamodel prisma/schema.prisma --exit-code
echo 'Production-schema upgrade preserved synthetic student, family and payment records.'
