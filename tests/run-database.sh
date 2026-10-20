#!/usr/bin/env bash
# Requer Docker. Banco descartável, sem publicar portas e sem credenciais reais.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
container_name="diary-pg-test-$$"
cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --name "$container_name" --network none -e POSTGRES_HOST_AUTH_METHOD=trust -d postgres:17-alpine >/dev/null
ready=0
for attempt in {1..30}; do
  if docker exec "$container_name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then docker logs "$container_name"; exit 1; fi
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/tests/db-bootstrap.sql"
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/supabase/schema.sql"
# Confirma reaplicação segura antes de criar as contas fictícias.
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/supabase/schema.sql"
bash "$repo_dir/tests/admin-bootstrap.sh" "$container_name"
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_dir/tests/database-security.sql"
echo 'PASS: políticas/RPCs testadas em PostgreSQL 17 local; não é teste do Auth/Storage HTTP do Supabase.'
