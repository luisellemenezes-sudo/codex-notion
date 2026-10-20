export const MAX_FILES = 8;
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_BODY = 10000;
export const MIME_EXT = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' });
export function safeFilename(name = 'foto', fallback = 'foto') {
  const clean = name.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/^\.+/, '').trim();
  return clean.slice(0, 160) || fallback;
}
export function uniqueFilename(name, used) {
  const safe = safeFilename(name);
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  let candidate = safe, n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${stem} (${n++})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}
export function validateFile(file) {
  if (!MIME_EXT[file.type]) throw new Error('Formato não aceito. Use JPEG, PNG, WebP ou GIF. Converta HEIC para JPEG antes de enviar.');
  if (!file.size) throw new Error('O arquivo está vazio.');
  if (file.size > MAX_BYTES) throw new Error('Cada foto pode ter até 20 MB.');
}
export function validatePost(body, count) {
  if (body.length > MAX_BODY) throw new Error('O texto pode ter até 10.000 caracteres.');
  if (count > MAX_FILES) throw new Error('Cada publicação pode ter até 8 fotos.');
  if (!body.trim() && !count) throw new Error('Escreva uma mensagem ou escolha pelo menos uma foto.');
}
export function sniffMime(bytes) {
  const b = new Uint8Array(bytes);
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b[0] === 137 && String.fromCharCode(...b.slice(1, 4)) === 'PNG' && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 6)).match(/^GIF8[79]a$/)) return 'image/gif';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
export function formatBytes(n) { return `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`; }
export function redirectBase(location) { return new URL('./', location.href).href; }
export function validateConfig(config) {
  if (!config?.supabaseUrl || !config?.supabaseKey) return false;
  let url;
  try { url = new URL(config.supabaseUrl); } catch { throw new Error('URL do Supabase inválida em assets/config.js.'); }
  if (url.protocol !== 'https:') throw new Error('A URL do Supabase deve usar HTTPS.');
  if (config.supabaseKey.startsWith('sb_secret_')) throw new Error('Chave secreta detectada. Remova-a e use somente a chave publicável.');
  const parts = config.supabaseKey.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error('Use a chave anon/publicável, nunca service_role.');
    } catch (error) { throw new Error('Chave inválida ou privilegiada. Use a chave publicável do Supabase.'); }
  } else if (!config.supabaseKey.startsWith('sb_publishable_')) throw new Error('Use a chave publicável do Supabase (sb_publishable_...) ou anon legada.');
  return true;
}
