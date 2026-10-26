#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# This script is deliberately limited to the named local synthetic test container.
if ! docker container inspect heartara-crm-test-db >/dev/null 2>&1; then
 docker run -d --name heartara-crm-test-db -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=heartara_test -p 127.0.0.1:55432:5432 postgres:17-alpine >/dev/null
fi
for attempt in {1..30}; do if docker exec heartara-crm-test-db pg_isready -U postgres >/dev/null 2>&1; then break;fi;sleep 1;done
docker exec heartara-crm-test-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS heartara_test WITH (FORCE)' -c 'CREATE DATABASE heartara_test' >/dev/null
docker exec -i heartara-crm-test-db psql -U postgres -d heartara_test -v ON_ERROR_STOP=1 < crm/tests/bootstrap.sql >/dev/null
for migration in supabase/migrations/*.sql; do docker exec -i heartara-crm-test-db psql -U postgres -d heartara_test -v ON_ERROR_STOP=1 < "$migration" >/dev/null;done
printf 'Synthetic test database reset and migrated.\n'
