import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFilename, uniqueFilename, validateFile, validatePost, sniffMime, redirectBase, validateConfig, MAX_BYTES } from '../assets/utils.mjs';

test('mensagens podem conter HTML como dados; valida presença e limites', () => {
  assert.doesNotThrow(() => validatePost('<img src=x onerror=alert(1)>', 0));
  assert.doesNotThrow(() => validatePost('', 1));
  assert.throws(() => validatePost(' \n ', 0));
  assert.throws(() => validatePost('x'.repeat(10001), 0));
  assert.throws(() => validatePost('foto', 9));
});
test('originais: formatos e tamanho são validados sem mutação', () => {
  const file = Object.freeze({ type: 'image/png', size: MAX_BYTES });
  assert.doesNotThrow(() => validateFile(file));
  assert.throws(() => validateFile({ type: 'image/svg+xml', size: 12 }));
  assert.throws(() => validateFile({ type: 'image/heic', size: 12 }));
  assert.throws(() => validateFile({ type: 'image/jpeg', size: 0 }));
  assert.throws(() => validateFile({ type: 'image/jpeg', size: MAX_BYTES + 1 }));
});
test('verifica assinaturas reais de imagens e rejeita SVG/HTML disfarçado', () => {
  assert.equal(sniffMime(new Uint8Array([255,216,255,224])), 'image/jpeg');
  assert.equal(sniffMime(new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(sniffMime(new TextEncoder().encode('GIF89a')), 'image/gif');
  assert.equal(sniffMime(new TextEncoder().encode('RIFF1234WEBP')), 'image/webp');
  assert.equal(sniffMime(new TextEncoder().encode('<svg onload=x>')), null);
});
test('ZIP: nomes sem travessia de pastas e sem sobreposição de arquivos', () => {
  assert.equal(safeFilename('../../foto.jpg').includes('/'), false);
  assert.equal(safeFilename('..'), 'foto');
  assert.equal(safeFilename('foto\u0000.png'), 'foto_.png');
  const used = new Set();
  assert.equal(uniqueFilename('foto.jpg', used), 'foto.jpg');
  assert.equal(uniqueFilename('foto.jpg', used), 'foto (2).jpg');
  assert.equal(uniqueFilename('FOTO.jpg', used), 'FOTO (3).jpg');
});
test('retorno de e-mail preserva /blog/ removendo tokens e queries', () => {
  assert.equal(redirectBase({ href: 'https://example.com/blog/index.html?code=private#hash' }), 'https://example.com/blog/');
  assert.equal(redirectBase({ href: 'https://example.com/' }), 'https://example.com/');
});
test('configuração rejeita chaves privilegiadas e HTTP', () => {
  assert.equal(validateConfig({}), false);
  assert.equal(validateConfig({ supabaseUrl: 'https://sample.supabase.co', supabaseKey: 'sb_publishable_test' }), true);
  assert.throws(() => validateConfig({ supabaseUrl: 'http://sample.supabase.co', supabaseKey: 'sb_publishable_test' }));
  assert.throws(() => validateConfig({ supabaseUrl: 'https://sample.supabase.co', supabaseKey: 'sb_secret_test' }));
  const token = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.throws(() => validateConfig({ supabaseUrl: 'https://sample.supabase.co', supabaseKey: token('service_role') }));
  assert.equal(validateConfig({ supabaseUrl: 'https://sample.supabase.co', supabaseKey: token('anon') }), true);
});
