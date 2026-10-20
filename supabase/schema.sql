-- Diário entre amigos — executar no SQL Editor do SEU projeto Supabase.
-- Reaplicável: não apaga usuários, publicações nem objetos existentes.
-- Nenhuma chave secreta deve ser colocada neste arquivo ou no navegador.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'pending' check (status in ('pending','approved','suspended')),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint own_avatar_path check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$'))
);
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  original_path text not null unique,
  thumbnail_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  width integer not null check (width between 1 and 40000),
  height integer not null check (height between 1 and 40000),
  sort_order integer not null check (sort_order between 0 and 7),
  created_at timestamptz not null default now()
);
create index if not exists posts_recent_idx on public.posts(created_at desc, id desc);
create index if not exists photos_post_idx on public.post_photos(post_id, sort_order);
create index if not exists profiles_status_idx on public.profiles(status);

-- Consulta ao banco a cada operação; uma sessão antiga não ignora suspensão.
create or replace function private.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and status='approved');
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and status='approved' and role='admin');
$$;
revoke all on function private.is_approved(), private.is_admin() from public, anon;
grant execute on function private.is_approved(), private.is_admin() to authenticated;

create or replace function private.profile_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id then raise exception 'O identificador do perfil não pode mudar.' using errcode='42501'; end if;
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and current_user not in ('postgres','supabase_admin') then
    raise exception 'Somente a administração pode alterar permissões.' using errcode='42501';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists diary_profile_guard on public.profiles;
create trigger diary_profile_guard before update on public.profiles for each row execute function private.profile_guard();

-- Nunca confiar em role/status enviados no cadastro pelo navegador.
create or replace function private.new_user_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name,role,status)
  values(new.id, coalesce(nullif(left(btrim(new.raw_user_meta_data->>'display_name'),80),''),'Novo amigo'),'member','pending');
  return new;
end;
$$;
revoke all on function private.new_user_profile(), private.profile_guard() from public, anon, authenticated;
drop trigger if exists diary_new_user on auth.users;
create trigger diary_new_user after insert on auth.users for each row execute function private.new_user_profile();
-- Inclui contas anteriores à instalação sem alterar perfis existentes.
insert into public.profiles(id,display_name,role,status)
select id,coalesce(nullif(left(btrim(raw_user_meta_data->>'display_name'),80),''),'Novo amigo'),'member','pending'
from auth.users on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_photos enable row level security;
revoke all on public.profiles, public.posts, public.post_photos from public, anon, authenticated;
grant select on public.profiles, public.posts, public.post_photos to authenticated;
grant update(display_name, avatar_path) on public.profiles to authenticated;
grant delete on public.posts to authenticated;

drop policy if exists diary_profiles_read on public.profiles;
create policy diary_profiles_read on public.profiles for select to authenticated
using (id=auth.uid() or private.is_approved());
drop policy if exists diary_profiles_update on public.profiles;
create policy diary_profiles_update on public.profiles for update to authenticated
using (id=auth.uid()) with check(id=auth.uid());
drop policy if exists diary_posts_read on public.posts;
create policy diary_posts_read on public.posts for select to authenticated using(private.is_approved());
drop policy if exists diary_posts_delete on public.posts;
create policy diary_posts_delete on public.posts for delete to authenticated
using(private.is_approved() and (author_id=auth.uid() or private.is_admin()));
drop policy if exists diary_photos_read on public.post_photos;
create policy diary_photos_read on public.post_photos for select to authenticated using(private.is_approved());

-- Todos os buckets são privados. Objetos não têm permissão de sobrescrita:
-- cada upload usa UUID novo e upsert:false para preservar o original.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('originals','originals',false,20971520,array['image/jpeg','image/png','image/webp','image/gif']),
('thumbnails','thumbnails',false,1048576,array['image/jpeg']),
('avatars','avatars',false,3145728,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists diary_media_read on storage.objects;
create policy diary_media_read on storage.objects for select to authenticated using (
  (bucket_id='originals' and private.is_approved() and (split_part(name,'/',1)=auth.uid()::text or private.is_admin() or exists(select 1 from public.post_photos f where f.original_path=name)))
  or (bucket_id='thumbnails' and private.is_approved() and (split_part(name,'/',1)=auth.uid()::text or private.is_admin() or exists(select 1 from public.post_photos f where f.thumbnail_path=name)))
  or (bucket_id='avatars' and (
    (split_part(name,'/',1)=auth.uid()::text)
    or (private.is_approved() and exists(select 1 from public.profiles p where p.avatar_path=name))
  ))
);
drop policy if exists diary_media_upload on storage.objects;
create policy diary_media_upload on storage.objects for insert to authenticated with check (
  split_part(name,'/',1)=auth.uid()::text and (
    (bucket_id in ('originals','thumbnails') and private.is_approved()
      and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$')
      and (bucket_id <> 'thumbnails' or right(name,4)='.jpg'))
    or (bucket_id='avatars' and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.jpg$'))
  )
);
drop policy if exists diary_media_delete on storage.objects;
create policy diary_media_delete on storage.objects for delete to authenticated using (
  bucket_id in ('originals','thumbnails','avatars') and (
    private.is_admin()
    or (split_part(name,'/',1)=auth.uid()::text and (bucket_id='avatars' or private.is_approved()))
  )
);
-- Sem política UPDATE: o conteúdo dos originais publicados é imutável.

-- Auxiliar interna. Só as RPCs abaixo podem registrar arquivos no feed.
create or replace function private.attach_photos(p_post_id uuid,p_photos jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  item jsonb; photo_id uuid; original text; thumbnail text; mime text; bytes bigint;
  expected_prefix text; n integer; ext text;
begin
  if p_photos is null or jsonb_typeof(p_photos)<>'array' then
    raise exception 'A lista de fotos é inválida.' using errcode='22023';
  end if;
  select count(*) into n from public.post_photos where post_id=p_post_id;
  if n+jsonb_array_length(p_photos)>8 then raise exception 'Cada publicação aceita até 8 fotos.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_photos) loop
    photo_id := (item->>'id')::uuid;
    original := item->>'original_path'; thumbnail := item->>'thumbnail_path';
    mime := item->>'mime_type'; bytes := (item->>'size_bytes')::bigint;
    expected_prefix := auth.uid()::text || '/' || p_post_id::text || '/' || photo_id::text;
    ext := case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/gif' then 'gif' else null end;
    if photo_id is null or ext is null or original is null or thumbnail is null
       or (original<>expected_prefix||'.'||ext and not(mime='image/jpeg' and original=expected_prefix||'.jpeg'))
       or thumbnail<>expected_prefix||'.jpg' then
      raise exception 'Os caminhos ou o formato da foto são inválidos.' using errcode='22023';
    end if;
    if not exists(select 1 from storage.objects where bucket_id='originals' and name=original
      and (metadata->>'size')::bigint=bytes and metadata->>'mimetype'=mime)
      or not exists(select 1 from storage.objects where bucket_id='thumbnails' and name=thumbnail
      and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 1048576) then
      raise exception 'Envie o original e a miniatura antes de publicar.' using errcode='22023';
    end if;
    insert into public.post_photos(id,post_id,uploader_id,original_path,thumbnail_path,original_name,mime_type,size_bytes,width,height,sort_order)
    values(photo_id,p_post_id,auth.uid(),original,thumbnail,item->>'original_name',mime,bytes,(item->>'width')::int,(item->>'height')::int,n);
    n:=n+1;
  end loop;
end;
$$;
revoke all on function private.attach_photos(uuid,jsonb) from public,anon,authenticated;

create or replace function public.publish_post(p_id uuid,p_body text,p_photos jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_approved() then raise exception 'Seu acesso ainda não foi aprovado ou foi suspenso.' using errcode='42501'; end if;
  if p_id is null or p_body is null or char_length(p_body)>10000 then raise exception 'Publicação inválida.' using errcode='22023'; end if;
  insert into public.posts(id,author_id,body) values(p_id,auth.uid(),p_body);
  perform private.attach_photos(p_id,p_photos);
  if btrim(p_body)='' and not exists(select 1 from public.post_photos where post_id=p_id) then
    raise exception 'Escreva uma mensagem ou adicione uma foto.' using errcode='22023';
  end if;
  return p_id;
end;
$$;

create or replace function public.edit_post(p_id uuid,p_body text,p_remove_photo_ids uuid[] default '{}'::uuid[],p_photos jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  if not private.is_approved() then raise exception 'Seu acesso ainda não foi aprovado ou foi suspenso.' using errcode='42501'; end if;
  select author_id into owner_id from public.posts where id=p_id for update;
  if owner_id is null or owner_id<>auth.uid() then raise exception 'Você só pode editar suas próprias publicações.' using errcode='42501'; end if;
  if p_body is null or char_length(p_body)>10000 then raise exception 'Texto inválido.' using errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(p_remove_photo_ids,'{}'::uuid[])) x where not exists(select 1 from public.post_photos f where f.id=x and f.post_id=p_id)) then
    raise exception 'A foto não pertence a esta publicação.' using errcode='42501';
  end if;
  delete from public.post_photos where post_id=p_id and id=any(coalesce(p_remove_photo_ids,'{}'::uuid[]));
  with positions as (select id,(row_number() over(order by sort_order,id)-1)::int as position from public.post_photos where post_id=p_id)
  update public.post_photos f set sort_order=p.position from positions p where f.id=p.id;
  perform private.attach_photos(p_id,p_photos);
  if btrim(p_body)='' and not exists(select 1 from public.post_photos where post_id=p_id) then
    raise exception 'A publicação precisa de texto ou foto.' using errcode='22023';
  end if;
  update public.posts set body=p_body,updated_at=now() where id=p_id;
  return p_id;
end;
$$;

create or replace function public.admin_set_member(p_user_id uuid,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Ação restrita à administração.' using errcode='42501'; end if;
  if p_status is null or p_status not in ('approved','suspended') then raise exception 'Situação inválida.' using errcode='22023'; end if;
  update public.profiles set status=p_status where id=p_user_id and role='member';
  if not found then raise exception 'Membro não encontrado ou conta administrativa protegida.' using errcode='22023'; end if;
end;
$$;
revoke all on function public.publish_post(uuid,text,jsonb),public.edit_post(uuid,text,uuid[],jsonb),public.admin_set_member(uuid,text) from public,anon;
grant execute on function public.publish_post(uuid,text,jsonb),public.edit_post(uuid,text,uuid[],jsonb),public.admin_set_member(uuid,text) to authenticated;

commit;

-- Primeiro administrador: siga o procedimento com e-mail confirmado em
-- supabase/primeiro-admin.sql. Nunca aceite role/status de metadados do cadastro.
-- IMPORTANTE: use projeto dedicado, sem outras políticas permissivas nestas
-- tabelas/buckets. Políticas PostgreSQL permissivas são somadas por OR.
