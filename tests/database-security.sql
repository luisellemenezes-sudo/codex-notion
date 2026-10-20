\set ON_ERROR_STOP on
-- Contas fictícias: admin, Alice, Bruno e conta pendente.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','admin@example.test',now(),'{"display_name":"Admin"}'),
('10000000-0000-4000-8000-000000000002','alice@example.test',now(),'{"display_name":"Alice","role":"admin","status":"approved"}'),
('10000000-0000-4000-8000-000000000003','bruno@example.test',now(),'{"display_name":"Bruno"}'),
('10000000-0000-4000-8000-000000000004','pending@example.test',now(),'{"display_name":"Pendente"}');
select test.ok('Metadados do cadastro não promovem usuário',(select role='member' and status='pending' from public.profiles where id='10000000-0000-4000-8000-000000000002'));
update public.profiles set role='admin',status='approved' where id='10000000-0000-4000-8000-000000000001';

set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
select test.denied('Usuário não consegue se aprovar',$q$update public.profiles set status='approved' where id=auth.uid()$q$);
select test.denied('Usuário não consegue virar administrador',$q$update public.profiles set role='admin' where id=auth.uid()$q$);
select test.denied('Usuário comum não chama aprovação',$q$select public.admin_set_member(auth.uid(),'approved')$q$);
select test.denied('Pendente não publica',$q$select public.publish_post('30000000-0000-4000-8000-000000000001','Texto','[]')$q$);
select test.denied('Pendente não envia foto',$q$insert into storage.objects(bucket_id,name,metadata) values('originals',auth.uid()::text||'/30000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','{}')$q$);

set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select public.admin_set_member('10000000-0000-4000-8000-000000000002','approved');
select public.admin_set_member('10000000-0000-4000-8000-000000000003','approved');
select test.ok('Administrador aprova membros',(select count(*)=3 from public.profiles where status='approved'));
select test.invalid('RPC não suspende administradores',$q$select public.admin_set_member(auth.uid(),'suspended')$q$);

set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
select test.invalid('Publicação vazia é rejeitada',$q$select public.publish_post('30000000-0000-4000-8000-000000000001','  ','[]')$q$);
select test.ok('Publicação inválida não deixa registro',(select count(*)=0 from public.posts));
insert into storage.objects(bucket_id,name,metadata) values
('originals','10000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','{"size":1234,"mimetype":"image/jpeg"}'),
('thumbnails','10000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','{"size":321,"mimetype":"image/jpeg"}');
select test.ok('Autor consegue acessar upload ainda não publicado',(select count(*)=2 from storage.objects));
select test.denied('Upload em pasta de outra pessoa é bloqueado',$q$insert into storage.objects(bucket_id,name,metadata) values('originals','10000000-0000-4000-8000-000000000003/30000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','{}')$q$);
with changed as (update storage.objects set metadata='{}' where bucket_id='originals' returning id)
select test.ok('Originais não podem ser sobrescritos',(select count(*)=0 from changed));

set request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
select test.ok('Outro membro não lê uploads não publicados',(select count(*)=0 from storage.objects));
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
select test.invalid('Foto com tamanho forjado é rejeitada',$q$select public.publish_post('30000000-0000-4000-8000-000000000001','',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','original_path',auth.uid()::text||'/30000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','thumbnail_path',auth.uid()::text||'/30000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','original_name','foto.jpg','mime_type','image/jpeg','size_bytes',9999,'width',600,'height',400)))$q$);
select public.publish_post('30000000-0000-4000-8000-000000000001','',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000001','original_path',auth.uid()::text||'/30000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','thumbnail_path',auth.uid()::text||'/30000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg','original_name','foto.jpg','mime_type','image/jpeg','size_bytes',1234,'width',600,'height',400)));
select test.ok('Publicação apenas com foto funciona',(select count(*)=1 from public.posts));
select public.publish_post('30000000-0000-4000-8000-000000000002','Só texto','[]');
select test.ok('Publicação apenas com texto funciona',(select count(*)=2 from public.posts));
select public.edit_post('30000000-0000-4000-8000-000000000002','Texto editado');
select test.ok('Autor edita sua publicação',(select body='Texto editado' from public.posts where id='30000000-0000-4000-8000-000000000002'));
select test.invalid('Edição não permite remover o último conteúdo',$q$select public.edit_post('30000000-0000-4000-8000-000000000001','','{20000000-0000-4000-8000-000000000001}','[]')$q$);

set request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
select test.ok('Segundo membro lê feed e fotos de outro autor',(select count(*)=2 from public.posts) and (select count(*)=1 from public.post_photos));
select test.ok('Segundo membro tem acesso privado ao original para download',(select count(*)=1 from storage.objects where bucket_id='originals'));
select test.denied('Segundo membro não edita publicação alheia',$q$select public.edit_post('30000000-0000-4000-8000-000000000002','Invadido')$q$);
select test.denied('Inserção direta não contorna a RPC',$q$insert into public.posts(id,author_id,body) values('30000000-0000-4000-8000-000000000099',auth.uid(),'Bypass')$q$);
select public.publish_post('30000000-0000-4000-8000-000000000003','Publicação de Bruno','[]');
select test.ok('Segundo membro também publica',(select author_id=auth.uid() from public.posts where id='30000000-0000-4000-8000-000000000003'));
select public.edit_post('30000000-0000-4000-8000-000000000003','Publicação de Bruno editada');
with deleted as (delete from public.posts where id='30000000-0000-4000-8000-000000000003' returning id)
select test.ok('Segundo membro edita e exclui sua publicação',(select count(*)=1 from deleted));
with deleted as (delete from public.posts where id='30000000-0000-4000-8000-000000000002' returning id)
select test.ok('Segundo membro não exclui publicação alheia',(select count(*)=0 from deleted));
with deleted as (delete from storage.objects where bucket_id='originals' returning id)
select test.ok('Segundo membro não exclui original alheio',(select count(*)=0 from deleted));
with changed as (update public.profiles set display_name='Invadido' where id='10000000-0000-4000-8000-000000000002' returning id)
select test.ok('Perfil alheio não pode ser editado',(select count(*)=0 from changed));

set request.jwt.claim.sub='10000000-0000-4000-8000-000000000004';
select test.ok('Pendente não lê feed nem fotos nem originais',(select count(*)=0 from public.posts) and (select count(*)=0 from public.post_photos) and (select count(*)=0 from storage.objects));
select test.ok('Pendente só vê próprio perfil',(select count(*)=1 from public.profiles));

set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select public.admin_set_member('10000000-0000-4000-8000-000000000003','suspended');
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
select test.ok('Sessão existente perde feed e downloads imediatamente após suspensão',(select count(*)=0 from public.posts) and (select count(*)=0 from storage.objects));
select test.denied('Suspenso não publica',$q$select public.publish_post('30000000-0000-4000-8000-000000000003','Suspenso','[]')$q$);

reset role;
set role anon;
set request.jwt.claim.sub='';
select test.denied('Anônimo não lê registros',$q$select * from public.posts$q$);
select test.ok('Anônimo não lê objetos para download',(select count(*)=0 from storage.objects));
select test.denied('Anônimo não executa RPC de publicação',$q$select public.publish_post('30000000-0000-4000-8000-000000000003','Anônimo','[]')$q$);

reset role;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
with deleted as (delete from storage.objects where bucket_id='originals' returning id)
select test.ok('Administrador remove original de outro autor',(select count(*)=1 from deleted));
with deleted as (delete from public.posts where id='30000000-0000-4000-8000-000000000001' returning id)
select test.ok('Administrador remove publicação de outro autor',(select count(*)=1 from deleted));
select test.ok('Remover publicação remove metadados das fotos',(select count(*)=0 from public.post_photos));
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
with deleted as (delete from storage.objects where bucket_id='thumbnails' returning id)
select test.ok('Autor limpa miniatura órfã depois da exclusão',(select count(*)=1 from deleted));
reset role;
