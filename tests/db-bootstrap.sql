-- Apenas no PostgreSQL descartável dos testes; NÃO executar no Supabase.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated,anon;
create schema test;
grant usage on schema test to authenticated,anon;
create function test.ok(p_label text,p_ok boolean) returns void language plpgsql as $$
begin
 if p_ok is distinct from true then raise exception 'FAIL: %',p_label; end if;
 raise notice 'PASS: %',p_label;
end $$;
create function test.denied(p_label text,p_sql text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when insufficient_privilege then raise notice 'PASS: %',p_label; return; end;
 raise exception 'FAIL (não bloqueado): %',p_label;
end $$;
create function test.invalid(p_label text,p_sql text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when invalid_parameter_value or check_violation or not_null_violation then raise notice 'PASS: %',p_label; return; end;
 raise exception 'FAIL (entrada aceita): %',p_label;
end $$;
grant execute on all functions in schema test to authenticated,anon;
