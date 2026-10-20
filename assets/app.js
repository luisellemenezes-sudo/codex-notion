import { MAX_FILES, MAX_BODY, MIME_EXT, safeFilename, uniqueFilename, validateFile, validatePost, sniffMime, formatBytes, redirectBase, validateConfig } from './utils.mjs';

const $ = (id) => document.getElementById(id);
const state = { user: null, profile: null, posts: [], page: 0, more: true, epoch: 0, loading: false, mode: 'login', editing: null, selected: [], existing: [], removed: new Set(), blobs: new Map(), blobJobs: new Map(), lightbox: [], lightIndex: 0, downloadBusy: false, recovery: false, confirmResolve: null, busy: false };
let db;
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const errorMessages = { 'Invalid login credentials': 'E-mail ou senha incorretos.', 'Email not confirmed': 'Confirme seu e-mail antes de entrar.', 'User already registered': 'Este e-mail já está cadastrado.', 'New password should be different from the old password.': 'Escolha uma senha diferente da anterior.', 'Email rate limit exceeded': 'Limite de e-mails atingido. Aguarde alguns minutos e tente novamente.', 'JWT expired': 'Sua sessão expirou. Entre novamente.' };
function readable(error) {
  const message = error?.message || String(error || '');
  if (errorMessages[message]) return errorMessages[message];
  if (error?.name === 'AbortError') return 'Download interrompido. Entre novamente ou tente baixar outra vez.';
  if (/fetch|network|Failed to/i.test(message)) return 'Não foi possível conectar. Confira sua internet e tente novamente.';
  if (/row.level|policy|permission|not authorized|approved|aprova|suspend/i.test(message)) return 'Acesso indisponível. Verifique se sua conta está aprovada e atualize a página.';
  if (/rate.limit|too many/i.test(message)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  return message || 'Algo deu errado. Tente novamente.';
}
function notice(message, bad = false) {
  const activeDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  (activeDialog || document.body).append($('toast'));
  $('toast').textContent = message;
  $('toast').classList.toggle('is-error', bad);
  $('toast').hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function message(id, value, bad = false) { if ($(id)) { $(id).hidden = !value; $(id).textContent = value; $(id).classList.toggle('is-error', bad); } }
function unwrap(result) { if (result.error) throw result.error; return result.data; }
function screen(id) { for (const screenId of ['setup-screen', 'auth-screen', 'waiting-screen', 'app-screen']) $(screenId).hidden = screenId !== id; }
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function button(text, fn, className = 'button button-ghost') { const el = node('button', className, text); el.type = 'button'; el.addEventListener('click', fn); return el; }
function openDialog(id) { const dialog = $(id); if (!dialog.open) dialog.showModal(); }
function closeDialog(id) { $(id).close(); }
function imageElement(className, alt) { const img = node('img', className); img.alt = alt; img.decoding = 'async'; return img; }
function revokeBlobs() { state.epoch++; state.blobs.forEach(URL.revokeObjectURL); state.blobs.clear(); state.blobJobs.clear(); }
function clearPrivate() {
  state.downloadController?.abort();
  revokeBlobs(); state.posts = []; state.page = 0; state.more = true; $('feed').replaceChildren(); $('member-list').replaceChildren();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('lightbox-image').removeAttribute('src'); $('member-avatar').removeAttribute('src'); $('profile-preview').removeAttribute('src');
  if (state.downloadUrl) { URL.revokeObjectURL(state.downloadUrl); state.downloadUrl = null; } $('download-result')?.remove(); $('download-panel').hidden = true;
  resetComposer();
}
async function profileNow() {
  if (!state.user) throw new Error('Entre na sua conta para continuar.');
  const profile = unwrap(await db.from('profiles').select('*').eq('id', state.user.id).single());
  state.profile = profile;
  if (profile.status !== 'approved') { showWaiting(profile); throw new Error('Sua conta precisa estar aprovada para acessar o diário.'); }
  return profile;
}
function showWaiting(profile) {
  clearPrivate(); screen('waiting-screen');
  $('waiting-title').textContent = profile?.status === 'suspended' ? 'Seu acesso está suspenso' : 'Falta só um abraço de boas-vindas';
  $('waiting-description').textContent = profile?.status === 'suspended' ? 'Seu acesso foi suspenso pelo administrador. Fale com ele para voltar ao diário.' : 'Sua conta foi criada. Assim que o administrador aprovar sua entrada, as histórias aparecem por aqui.';
}
async function syncSession({ forceFeed = false } = {}) {
  try {
    const session = unwrap(await db.auth.getSession())?.session;
    const previousUser = state.user?.id;
    state.user = session?.user || null;
    if (!state.user) { state.profile = null; clearPrivate(); screen('auth-screen'); return; }
    const wasApproved = state.profile?.status === 'approved' && previousUser === state.user.id;
    const profile = unwrap(await db.from('profiles').select('*').eq('id', state.user.id).single());
    state.profile = profile;
    if (profile.status !== 'approved') { showWaiting(profile); return; }
    screen('app-screen'); $('member-label').textContent = profile.display_name; $('open-admin').hidden = profile.role !== 'admin';
    $('member-avatar').alt = `Foto de ${profile.display_name}`;
    if (profile.avatar_path) loadImage($('member-avatar'), 'avatars', profile.avatar_path); else { $('member-avatar').removeAttribute('src'); $('member-avatar').hidden = true; }
    if (!wasApproved || forceFeed) await loadFeed(true);
  } catch (error) {
    clearPrivate(); screen(state.user ? 'waiting-screen' : 'auth-screen');
    if (state.user) { $('waiting-title').textContent = 'Não foi possível conferir seu acesso'; $('waiting-description').textContent = 'Confira a conexão e se o SQL foi aplicado no Supabase. Use “Verificar acesso” para tentar novamente.'; }
    notice(readable(error), true);
  }
}
async function privateBlob(bucket, path) { return unwrap(await db.storage.from(bucket).download(path)); }
async function blobUrl(bucket, path) {
  const key = `${bucket}:${path}`;
  if (state.blobs.has(key)) return state.blobs.get(key);
  if (state.blobJobs.has(key)) return state.blobJobs.get(key);
  const epoch = state.epoch;
  const job = privateBlob(bucket, path).then(blob => {
    if (epoch !== state.epoch) throw new Error('A sessão mudou.');
    const url = URL.createObjectURL(blob); state.blobs.set(key, url); return url;
  }).finally(() => state.blobJobs.delete(key));
  state.blobJobs.set(key, job); return job;
}
async function loadImage(img, bucket, path) {
  const epoch = state.epoch;
  try { const url = await blobUrl(bucket, path); if (epoch === state.epoch && img.isConnected) { img.src = url; img.hidden = false; img.classList.remove('image-error'); } }
  catch { if (epoch === state.epoch) { img.classList.add('image-error'); img.alt = 'Não foi possível carregar a imagem. Atualize para tentar novamente.'; } }
}
function setAuthMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-auth-tab]').forEach(el => { const active = el.dataset.authTab === mode; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); });
  $('auth-name').hidden = mode !== 'signup'; $('name').required = mode === 'signup';
  $('auth-password').hidden = mode === 'reset'; $('password').required = mode !== 'reset';
  $('password').minLength = mode === 'signup' ? 10 : 1;
  $('password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('password').placeholder = mode === 'signup' ? 'Pelo menos 10 caracteres' : 'Sua senha';
  if ($('auth-description')) $('auth-description').textContent = { login: 'Entre para ver o que a gente anda vivendo.', signup: 'Crie sua conta e aguarde a aprovação para entrar no diário.', reset: 'Enviaremos um link para você escolher uma nova senha.' }[mode];
  $('auth-title').textContent = { login: 'Que bom ter você aqui.', signup: 'Um lugar para as nossas histórias.', reset: 'Vamos recuperar seu acesso.' }[mode];
  $('auth-submit').textContent = { login: 'Entrar no diário', signup: 'Criar minha conta', reset: 'Enviar link de recuperação' }[mode];
  message('auth-message', '');
}
async function authenticate(event) {
  event.preventDefault(); const submit = $('auth-submit'); submit.disabled = true; message('auth-message', 'Só um instante…');
  try {
    const email = $('email').value.trim(), password = $('password').value;
    if (state.mode === 'login') { unwrap(await db.auth.signInWithPassword({ email, password })); await syncSession(); }
    else if (state.mode === 'signup') {
      const name = $('name').value.trim(); if (name.length < 2 || name.length > 80) throw new Error('Use um nome com 2 a 80 caracteres.');
      unwrap(await db.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: redirectBase(location) } }));
      message('auth-message', 'Se o cadastro puder ser realizado, você receberá um e-mail de confirmação. Depois de confirmar, aguarde a aprovação do administrador.');
      $('password').value = ''; await syncSession();
    } else {
      unwrap(await db.auth.resetPasswordForEmail(email, { redirectTo: redirectBase(location) }));
      message('auth-message', 'Se este e-mail estiver cadastrado, você receberá um link para definir uma nova senha. Confira também o spam.');
    }
  } catch (error) { message('auth-message', readable(error), true); }
  finally { submit.disabled = false; }
}
async function signOut() {
  try { unwrap(await db.auth.signOut({ scope: 'local' })); state.user = null; state.profile = null; clearPrivate(); screen('auth-screen'); setAuthMode('login'); $('password').value = ''; }
  catch (error) { notice(readable(error), true); }
}
async function loadFeed(reset = false) {
  if (state.loading) return; state.loading = true;
  const epoch = state.epoch; $('feed-loading').hidden = false; $('load-more').disabled = true; message('feed-error', '');
  try {
    await profileNow();
    const page = reset ? 0 : state.page;
    const data = unwrap(await db.from('posts').select('id,author_id,body,created_at,updated_at,profiles!posts_author_id_fkey(display_name,avatar_path),post_photos(*)').order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 10, page * 10 + 9));
    if (epoch !== state.epoch) return;
    if (reset) { $('feed').replaceChildren(); state.posts = []; }
    state.posts.push(...data); state.page = page + 1; state.more = data.length === 10;
    data.forEach(post => { post.post_photos.sort((a, b) => a.sort_order - b.sort_order); $('feed').append(renderPost(post)); });
    $('feed-empty').hidden = state.posts.length !== 0; $('load-more').hidden = !state.more;
  } catch (error) { message('feed-error', readable(error), true); }
  finally { state.loading = false; $('feed-loading').hidden = true; $('load-more').disabled = false; }
}
function renderPost(post) {
  const card = node('article', 'post-card'); card.dataset.postId = post.id;
  const header = node('div', 'post-header'); const avatar = imageElement('post-avatar', '');
  const author = post.profiles?.display_name || 'Amigo do diário'; if (post.profiles?.avatar_path) loadImageAfterConnect(avatar, 'avatars', post.profiles.avatar_path);
  const info = node('div', 'post-info'); info.append(node('span', 'post-author', author));
  const date = node('time', 'post-date', dateFormat.format(new Date(post.created_at))); date.dateTime = post.created_at; info.append(date); header.append(avatar, info);
  if (post.author_id === state.user.id || state.profile.role === 'admin') {
    const actions = node('div', 'post-actions');
    if (post.author_id === state.user.id) actions.append(button('Editar', () => openComposer(post)));
    actions.append(button('Excluir', () => removePost(post), 'button button-ghost danger')); header.append(actions);
  }
  card.append(header);
  if (post.body) card.append(node('p', 'post-body', post.body));
  if (post.post_photos.length) {
    const photos = node('div', `post-photos photos-${Math.min(post.post_photos.length, 4)}`);
    for (const [index, photo] of post.post_photos.entries()) {
      const frame = node('figure', 'photo-item'); const open = button('', () => openLightbox(post.post_photos, index), 'photo-open');
      open.setAttribute('aria-label', `Ampliar foto ${index + 1} de ${author}`);
      const img = imageElement('', `Foto ${index + 1} da publicação de ${author}`); img.loading = 'lazy'; open.append(img);
      loadImageAfterConnect(img, 'thumbnails', photo.thumbnail_path);
      const download = button('↓ Baixar foto', () => downloadPhotos([photo]), 'photo-download'); frame.append(open, download); photos.append(frame);
    }
    card.append(photos);
    const footer = node('div', 'post-footer'); footer.append(node('span', '', `${post.post_photos.length} ${post.post_photos.length === 1 ? 'lembrança' : 'lembranças'} · arquivos originais`), button('↓ Baixar todas as fotos desta publicação', () => downloadPhotos(post.post_photos, true))); card.append(footer);
  }
  return card;
}
function loadImageAfterConnect(img, bucket, path) { setTimeout(() => loadImage(img, bucket, path), 0); }

function resetComposer() {
  for (const item of state.selected) URL.revokeObjectURL(item.preview);
  state.selected = []; state.existing = []; state.removed = new Set(); state.editing = null;
  $('post-form').reset(); $('photo-previews').replaceChildren(); message('composer-message', ''); $('upload-progress').hidden = true; message('upload-status', '');
}
async function openComposer(post = null) {
  try {
    await profileNow(); resetComposer(); state.editing = post; state.existing = post ? [...post.post_photos] : [];
    $('composer-title').textContent = post ? 'Editar uma lembrança' : 'Uma nova lembrança'; $('post-body').value = post?.body || '';
    $('post-submit').textContent = post ? 'Salvar alterações' : 'Publicar no diário'; renderPreviews(); openDialog('composer-dialog');
  } catch (error) { notice(readable(error), true); }
}
function renderPreviews() {
  const container = $('photo-previews'); container.replaceChildren();
  for (const photo of state.existing.filter(p => !state.removed.has(p.id))) {
    const item = node('div', 'preview-item'); const img = imageElement('', photo.original_name);
    loadImageAfterConnect(img, 'thumbnails', photo.thumbnail_path);
    item.append(img, button('Remover foto', () => { state.removed.add(photo.id); renderPreviews(); }, 'preview-remove')); container.append(item);
  }
  for (const photo of state.selected) {
    const item = node('div', 'preview-item'); const img = imageElement('', photo.file.name); img.src = photo.preview;
    item.append(img, button('Remover foto', () => { URL.revokeObjectURL(photo.preview); state.selected = state.selected.filter(p => p !== photo); renderPreviews(); }, 'preview-remove')); container.append(item);
  }
}
async function selectPhotos(event) {
  const files = [...event.target.files]; event.target.value = '';
  try {
    if (state.selected.length + state.existing.length - state.removed.size + files.length > MAX_FILES) throw new Error('Escolha até 8 fotos por publicação.');
    files.forEach(validateFile);
    for (const file of files) {
      if (sniffMime(await file.slice(0, 16).arrayBuffer()) !== file.type) throw new Error(`O conteúdo de “${safeFilename(file.name)}” não corresponde ao formato informado.`);
    }
    state.selected.push(...files.map(file => ({ file, id: crypto.randomUUID(), preview: URL.createObjectURL(file) }))); renderPreviews(); message('composer-message', '');
  } catch (error) { message('composer-message', readable(error), true); }
}
async function makeThumbnail(file, maxDimension = 1200) {
  const image = new Image(); const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Não foi possível abrir esta foto. Escolha outro arquivo JPEG, PNG, WebP ou GIF válido.')); image.src = url; });
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width > 40000 || height > 40000 || width * height > 60000000) throw new Error('Esta foto é grande demais para processar neste navegador (limite de 60 megapixels).');
    const ratio = Math.min(1, maxDimension / Math.max(width, height)); const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Seu navegador não conseguiu criar a miniatura.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    for (const quality of [0.72, 0.60, 0.45]) { if (!blob || blob.size <= 1048576) break; blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality)); }
    if (!blob || blob.size > 1048576) throw new Error('Não foi possível gerar uma miniatura pequena o bastante. Escolha outra foto.');
    return { blob, width, height };
  } finally { URL.revokeObjectURL(url); }
}
async function upload(bucket, path, blob) {
  unwrap(await db.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '0' }));
}
async function cleanupFiles(files) {
  let failed = false;
  for (const bucket of ['originals', 'thumbnails', 'avatars']) {
    const paths = files.filter(f => f.bucket === bucket).map(f => f.path);
    if (paths.length) { try { unwrap(await db.storage.from(bucket).remove(paths)); } catch { failed = true; } }
  }
  return !failed;
}
function composerBusy(busy) {
  state.busy = busy;
  $('post-form').querySelectorAll('input,textarea,button').forEach(el => { el.disabled = busy; });
  $('composer-dialog').querySelectorAll('[data-close]').forEach(el => { el.disabled = busy; });
}
async function publish(event) {
  event.preventDefault(); if (state.busy) return;
  const body = $('post-body').value.trim(); const selected = [...state.selected]; const existing = state.existing.filter(p => !state.removed.has(p.id)); const removed = state.existing.filter(p => state.removed.has(p.id));
  const uploaded = []; let committed = false, saveAttempted = false; composerBusy(true); message('composer-message', ''); $('upload-progress').hidden = false; $('upload-progress').value = 0;
  try {
    validatePost(body, existing.length + selected.length); await profileNow();
    const postId = state.editing?.id || crypto.randomUUID(); const photos = [];
    for (const [index, photo] of selected.entries()) {
      message('upload-status', `Preparando e enviando foto ${index + 1} de ${selected.length}…`);
      validateFile(photo.file); const thumbnail = await makeThumbnail(photo.file);
      const base = `${state.user.id}/${postId}/${photo.id}`; const originalPath = `${base}.${MIME_EXT[photo.file.type]}`; const thumbnailPath = `${base}.jpg`;
      // O File original é enviado diretamente: nenhum canvas, reencodificação ou redução de qualidade.
      await upload('originals', originalPath, photo.file); uploaded.push({ bucket: 'originals', path: originalPath });
      await upload('thumbnails', thumbnailPath, thumbnail.blob); uploaded.push({ bucket: 'thumbnails', path: thumbnailPath });
      photos.push({ id: photo.id, original_path: originalPath, thumbnail_path: thumbnailPath, original_name: safeFilename(photo.file.name), mime_type: photo.file.type, size_bytes: photo.file.size, width: thumbnail.width, height: thumbnail.height, sort_order: existing.length + index });
      $('upload-progress').value = (index + 1) / Math.max(1, selected.length) * 90;
    }
    message('upload-status', 'Salvando a publicação…'); await profileNow();
    saveAttempted = true;
    if (state.editing) unwrap(await db.rpc('edit_post', { p_id: postId, p_body: body, p_remove_photo_ids: removed.map(p => p.id), p_photos: photos }));
    else unwrap(await db.rpc('publish_post', { p_id: postId, p_body: body, p_photos: photos }));
    committed = true; $('upload-progress').value = 100;
    const cleaned = await cleanupFiles(removed.flatMap(p => [{ bucket: 'originals', path: p.original_path }, { bucket: 'thumbnails', path: p.thumbnail_path }]));
    closeDialog('composer-dialog'); resetComposer(); revokeBlobs(); await loadFeed(true);
    notice(cleaned ? 'Sua lembrança foi salva no diário.' : 'Publicação salva. Alguns arquivos antigos precisam ser removidos pelo administrador no Storage.', !cleaned);
  } catch (error) {
    if (!committed && !saveAttempted) {
      const cleaned = await cleanupFiles(uploaded);
      message('composer-message', `${readable(error)}${cleaned ? '' : ' Alguns envios incompletos precisam ser limpos no Storage pelo administrador.'}`, true);
    } else if (!committed) {
      message('composer-message', `${readable(error)} Não foi possível confirmar se a publicação foi salva. Feche esta janela e atualize o diário antes de repetir. Os arquivos enviados continuam privados; o administrador pode limpar os que não forem usados.`, true);
    } else notice(readable(error), true);
  } finally { composerBusy(false); message('upload-status', ''); }
}
function confirmAction(text, label = 'Excluir') {
  $('confirm-yes').textContent = label; $('confirm-text').textContent = text; openDialog('confirm-dialog');
  return new Promise(resolve => { state.confirmResolve = resolve; });
}
async function removePost(post) {
  if (!await confirmAction('Excluir esta publicação e suas fotos do diário? Esta ação não pode ser desfeita.')) return;
  try {
    await profileNow();
    // Remover o registro primeiro revoga o acesso dos outros membros imediatamente.
    unwrap(await db.from('posts').delete().eq('id', post.id).select('id').single());
    const cleaned = await cleanupFiles(post.post_photos.flatMap(p => [{ bucket: 'originals', path: p.original_path }, { bucket: 'thumbnails', path: p.thumbnail_path }]));
    revokeBlobs(); await loadFeed(true);
    notice(cleaned ? 'Publicação excluída.' : 'Publicação excluída. O administrador deve limpar arquivos residuais no Storage.', !cleaned);
  } catch (error) { notice(readable(error), true); }
}
async function openProfile() {
  try {
    const profile = await profileNow(); $('profile-name').value = profile.display_name; $('profile-avatar').value = ''; message('profile-message', '');
    $('profile-preview').removeAttribute('src'); if (profile.avatar_path) loadImage($('profile-preview'), 'avatars', profile.avatar_path); openDialog('profile-dialog');
  } catch (error) { notice(readable(error), true); }
}
async function saveProfile(event) {
  event.preventDefault(); $('profile-submit').disabled = true; const uploaded = []; let saved = false, saveAttempted = false;
  try {
    const profile = await profileNow(); const name = $('profile-name').value.trim(); if (name.length < 2 || name.length > 80) throw new Error('Use um nome com 2 a 80 caracteres.');
    let avatar = profile.avatar_path; const file = $('profile-avatar').files[0];
    if (file) { validateFile(file); if (sniffMime(await file.slice(0, 16).arrayBuffer()) !== file.type) throw new Error('O formato da foto de perfil é inválido.'); const thumbnail = await makeThumbnail(file, 512); avatar = `${state.user.id}/${crypto.randomUUID()}.jpg`; await upload('avatars', avatar, thumbnail.blob); uploaded.push({ bucket: 'avatars', path: avatar }); }
    saveAttempted = true;
    unwrap(await db.from('profiles').update({ display_name: name, avatar_path: avatar }).eq('id', state.user.id).select('id').single()); saved = true;
    if (file && profile.avatar_path) await cleanupFiles([{ bucket: 'avatars', path: profile.avatar_path }]);
    closeDialog('profile-dialog'); revokeBlobs(); await syncSession({ forceFeed: true }); notice('Seu perfil foi atualizado.');
  } catch (error) { if (!saved && !saveAttempted) await cleanupFiles(uploaded); message('profile-message', `${readable(error)}${saveAttempted && !saved ? ' Não foi possível confirmar a alteração. Feche e reabra seu perfil antes de repetir.' : ''}`, true); }
  finally { $('profile-submit').disabled = false; }
}
async function openAdmin() {
  try {
    const profile = await profileNow(); if (profile.role !== 'admin') throw new Error('Somente o administrador pode gerenciar membros.');
    openDialog('admin-dialog'); $('member-list').textContent = 'Carregando membros…';
    const members = unwrap(await db.from('profiles').select('*').order('created_at', { ascending: false })); $('member-list').replaceChildren();
    const labels = { approved: 'Aprovado', pending: 'Aguardando aprovação', suspended: 'Suspenso' };
    for (const member of members) {
      const row = node('div', 'member-card'); const info = node('div'); info.append(node('strong', '', member.display_name), node('p', 'member-status', `${labels[member.status]}${member.role === 'admin' ? ' · Administrador' : ''}`)); row.append(info);
      if (member.role !== 'admin') row.append(button(member.status === 'approved' ? 'Suspender' : 'Aprovar', async () => {
        const status = member.status === 'approved' ? 'suspended' : 'approved';
        if (status === 'suspended' && !await confirmAction(`Suspender o acesso de ${member.display_name}? Essa pessoa deixará de acessar o diário até ser aprovada novamente.`, 'Suspender')) return;
        try { unwrap(await db.rpc('admin_set_member', { p_user_id: member.id, p_status: status })); await openAdmin(); notice(status === 'approved' ? 'Membro aprovado.' : 'Acesso suspenso.'); }
        catch (error) { notice(readable(error), true); }
      }, member.status === 'approved' ? 'button button-ghost danger' : 'button button-primary'));
      $('member-list').append(row);
    }
  } catch (error) { notice(readable(error), true); }
}

async function openLightbox(photos, index) {
  state.lightbox = photos; state.lightIndex = (index + photos.length) % photos.length;
  const photo = photos[state.lightIndex]; $('lightbox-image').removeAttribute('src'); $('lightbox-image').alt = photo.original_name;
  $('lightbox-caption').textContent = `Carregando original… · ${state.lightIndex + 1} / ${photos.length}`;
  $('lightbox-prev').hidden = $('lightbox-next').hidden = photos.length <= 1; openDialog('lightbox-dialog');
  const id = photo.id;
  try {
    await profileNow(); const url = await blobUrl('originals', photo.original_path);
    if (state.lightbox[state.lightIndex]?.id !== id || !$('lightbox-dialog').open) return;
    $('lightbox-image').src = url; $('lightbox-caption').textContent = `${safeFilename(photo.original_name)} · ${state.lightIndex + 1} / ${photos.length}`;
  } catch (error) { $('lightbox-caption').textContent = readable(error); }
}
async function streamOriginal(photo, onChunk) {
  const session = unwrap(await db.auth.getSession())?.session;
  if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
  const url = `${window.BLOG_CONFIG.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/authenticated/originals/${photo.original_path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, { signal: state.downloadController?.signal, headers: { apikey: window.BLOG_CONFIG.supabaseKey, Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 || response.status === 404 ? 'Você não tem acesso a esta foto, ou ela foi removida. Atualize o diário e tente novamente.' : 'Não foi possível baixar a foto. Tente novamente.');
  let received = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; received += value.byteLength; onChunk(value); }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  } else { const value = new Uint8Array(await response.arrayBuffer()); received = value.byteLength; onChunk(value); }
  if (received !== Number(photo.size_bytes)) throw new Error('O download ficou incompleto. Verifique a conexão e tente novamente.');
}
async function downloadPhotos(photos, archive = false) {
  if (state.downloadBusy) { notice('Um download já está sendo preparado. Aguarde terminar.'); return; }
  ($('lightbox-dialog').open ? $('lightbox-dialog') : document.body).append($('download-panel'));
  state.downloadBusy = true; state.downloadController = new AbortController(); $('download-panel').hidden = false; $('download-progress').value = 0;
  if (state.downloadUrl) { URL.revokeObjectURL(state.downloadUrl); state.downloadUrl = null; }
  $('download-result')?.remove();
  const userId = state.user?.id, epoch = state.epoch;
  try {
    await profileNow(); if (!photos.length) throw new Error('Esta publicação não tem fotos.');
    const total = photos.reduce((sum, p) => sum + Number(p.size_bytes), 0); let bytes = 0;
    let chunks = [], zip, zipError;
    if (archive) zip = new window.fflate.Zip((error, data) => { if (error) { zipError = error; return; } chunks.push(data); });
    const used = new Set();
    for (const [index, photo] of photos.entries()) {
      await profileNow(); if (state.user?.id !== userId || epoch !== state.epoch) throw new Error('Sua sessão ou o diário mudou. Tente baixar novamente.');
      const name = uniqueFilename(photo.original_name, used); let entry;
      if (archive) { entry = new window.fflate.ZipPassThrough(name); zip.add(entry); }
      await streamOriginal(photo, chunk => {
        if (state.user?.id !== userId || epoch !== state.epoch) throw new Error('Sua sessão mudou.');
        bytes += chunk.byteLength; if (archive) entry.push(chunk); else chunks.push(chunk);
        $('download-progress').value = Math.min(99, bytes / Math.max(1, total) * 100);
        $('download-status').textContent = `Baixando foto ${index + 1} de ${photos.length} · ${formatBytes(bytes)} de ${formatBytes(total)}`;
      });
      if (archive) entry.push(new Uint8Array(), true); if (zipError) throw zipError;
    }
    if (archive) { zip.end(); if (zipError) throw zipError; }
    // Revalida a aprovação antes de oferecer os bytes baixados para salvar.
    await profileNow(); if (state.user?.id !== userId || epoch !== state.epoch) throw new Error('Sua sessão mudou. Tente novamente.');
    const blob = new Blob(chunks, { type: archive ? 'application/zip' : photos[0].mime_type }); chunks = [];
    const url = URL.createObjectURL(blob); state.downloadUrl = url;
    const link = node('a', 'button button-primary', 'Salvar arquivo novamente'); link.id = 'download-result'; link.href = url;
    link.download = archive ? `entre-nos-fotos-${new Date().toISOString().slice(0, 10)}.zip` : safeFilename(photos[0].original_name);
    $('download-panel').append(link); $('download-progress').value = 100; $('download-status').textContent = 'Download pronto. Se não abriu, toque em “Salvar arquivo novamente”.'; link.click();
  } catch (error) {
    $('download-panel').hidden = false; $('download-status').textContent = readable(error); notice(readable(error), true);
  } finally { state.downloadBusy = false; state.downloadController = null; }
}
function bindEvents() {
  document.querySelectorAll('[data-auth-tab]').forEach(el => el.addEventListener('click', () => setAuthMode(el.dataset.authTab)));
  document.querySelectorAll('[data-action="sign-out"]').forEach(el => el.addEventListener('click', signOut));
  document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => closeDialog(el.dataset.close)));
  $('auth-form').addEventListener('submit', authenticate); $('refresh-status').addEventListener('click', () => syncSession({ forceFeed: true }));
  $('new-post').addEventListener('click', () => openComposer()); $('load-more').addEventListener('click', () => loadFeed());
  $('open-profile').addEventListener('click', openProfile); $('profile-form').addEventListener('submit', saveProfile); $('open-admin').addEventListener('click', openAdmin);
  $('post-form').addEventListener('submit', publish); $('post-files').addEventListener('change', selectPhotos); $('post-body').maxLength = MAX_BODY;
  $('composer-dialog').addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
  $('composer-dialog').addEventListener('close', () => { if (!state.busy) resetComposer(); });
  $('profile-avatar').addEventListener('change', async () => {
    const file = $('profile-avatar').files[0]; if (!file) return;
    try { validateFile(file); const { blob } = await makeThumbnail(file, 512); if (state.avatarPreview) URL.revokeObjectURL(state.avatarPreview); state.avatarPreview = URL.createObjectURL(blob); $('profile-preview').src = state.avatarPreview; message('profile-message', ''); }
    catch (error) { $('profile-avatar').value = ''; message('profile-message', readable(error), true); }
  });
  $('profile-dialog').addEventListener('close', () => { if (state.avatarPreview) { URL.revokeObjectURL(state.avatarPreview); state.avatarPreview = null; } });
  $('confirm-yes').addEventListener('click', () => { state.confirmResolve?.(true); state.confirmResolve = null; closeDialog('confirm-dialog'); });
  $('confirm-no').addEventListener('click', () => closeDialog('confirm-dialog'));
  $('confirm-dialog').addEventListener('close', () => { state.confirmResolve?.(false); state.confirmResolve = null; });
  $('lightbox-download').addEventListener('click', () => downloadPhotos([state.lightbox[state.lightIndex]]));
  $('lightbox-prev').addEventListener('click', () => openLightbox(state.lightbox, state.lightIndex - 1)); $('lightbox-next').addEventListener('click', () => openLightbox(state.lightbox, state.lightIndex + 1));
  $('lightbox-dialog').addEventListener('close', () => document.body.append($('download-panel')));
  $('lightbox-dialog').addEventListener('keydown', event => { if (event.key === 'ArrowLeft') openLightbox(state.lightbox, state.lightIndex - 1); if (event.key === 'ArrowRight') openLightbox(state.lightbox, state.lightIndex + 1); });
  $('password-form').addEventListener('submit', async event => {
    event.preventDefault(); $('password-submit').disabled = true;
    try { const password = $('new-password').value; if (password.length < 10) throw new Error('A senha precisa ter pelo menos 10 caracteres.'); unwrap(await db.auth.updateUser({ password })); state.recovery = false; closeDialog('password-dialog'); $('new-password').value = ''; notice('Senha atualizada.'); await syncSession(); }
    catch (error) { message('password-message', readable(error), true); }
    finally { $('password-submit').disabled = false; }
  });
  $('password-dialog').addEventListener('cancel', event => { if (state.recovery) event.preventDefault(); });
  $('reload-config')?.addEventListener('click', () => location.reload());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && db && state.user) syncSession(); });
}
async function boot() {
  bindEvents(); setAuthMode('login');
  try {
    if (!validateConfig(window.BLOG_CONFIG)) { screen('setup-screen'); return; }
    if (!window.supabase || !window.fflate) throw new Error('Arquivos de dependências ausentes. Envie a pasta assets completa para a hospedagem.');
    db = window.supabase.createClient(window.BLOG_CONFIG.supabaseUrl, window.BLOG_CONFIG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    db.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') state.recovery = true;
      if (['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY', 'USER_UPDATED'].includes(event)) setTimeout(async () => { await syncSession(); if (state.recovery && state.user) openDialog('password-dialog'); }, 0);
    });
    await syncSession();
    const authError = new URLSearchParams(location.hash.slice(1)).get('error_description') || new URL(location.href).searchParams.get('error_description');
    if (authError) { notice('O link de acesso expirou ou é inválido. Solicite um novo e-mail.', true); history.replaceState(null, '', redirectBase(location)); }
    setInterval(() => { if (state.user && !document.hidden && !state.busy) syncSession(); }, 30000);
  } catch (error) { screen('setup-screen'); notice(readable(error), true); }
}
boot();
