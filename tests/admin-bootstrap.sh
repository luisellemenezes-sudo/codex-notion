#!/usr/bin/env bash
# Invocado por run-database.sh no banco descartável, nunca em contas reais.
set -euo pipefail
container_name="$1"
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
sqlrun() { docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -qtA -v ON_ERROR_STOP=1; }
bootstrap_sql="$(cat "$repo_dir/supabase/primeiro-admin.sql")"
assert_blocked() {
  local label="$1" expected="$2" result
  if result="$(printf '%s\n' "$bootstrap_sql" | sqlrun 2>&1)"; then
    printf 'FAIL: bootstrap %s não foi bloqueado\n' "$label"; exit 1
  fi
  if [[ "$result" != *"$expected"* ]]; then printf '%s\n' "$result"; exit 1; fi
  printf 'PASS: bootstrap %s\n' "$label"
}
assert_blocked 'exige substituir o e-mail de exemplo' 'Preencha o seu e-mail confirmado'
bootstrap_sql="${bootstrap_sql/"v_email text := 'SUBSTITUA_PELO_SEU_EMAIL';"/"v_email text := 'bootstrap@example.test';"}"
assert_blocked 'rejeita usuário inexistente' 'Esperado exatamente um usuário'
printf '%s\n' "insert into auth.users(id,email) values('50000000-0000-4000-8000-000000000001','bootstrap@example.test');" | sqlrun
assert_blocked 'rejeita e-mail não confirmado' 'O e-mail ainda não foi confirmado'
printf '%s\n' "update auth.users set email_confirmed_at=now() where email='bootstrap@example.test';" | sqlrun
printf '%s\n' "$bootstrap_sql" | sqlrun
result="$(printf '%s\n' "select role='admin' and status='approved' from public.profiles where id='50000000-0000-4000-8000-000000000001';" | sqlrun)"
if [[ "$result" != 't' ]]; then printf 'FAIL: bootstrap não promoveu conta confirmada\n'; exit 1; fi
printf 'PASS: bootstrap promove exatamente a conta confirmada\n'
assert_blocked 'não cria outro administrador se já existir um' 'Já existe um administrador'
printf '%s\n' "delete from auth.users where id='50000000-0000-4000-8000-000000000001';" | sqlrun
