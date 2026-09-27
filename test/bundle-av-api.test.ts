// Kiem tra file deploy av-api.js (da bundle) chay duoc, khong phai chi ton tai.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REAL_FETCH = globalThis.fetch;
const src = readFileSync('workers/av-api/av-api.js', 'utf8');

function loadBundled() {
  // Bundle ESM co export default. Dung data: URL de import no.
  const url = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
  return import(url);
}

test('bundle: co export default', () => {
  // Bundler hay ghep thanh `export { index_default as default }`
  const ok = /export\s+default\b/.test(src) || /export\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(src);
  assert.ok(ok, 'khong tim thay export default trong bundle');
});

test('bundle: khong con import ben ngoai (da ghep het)', () => {
  const imports = src.match(/^\s*import\s.*from\s*["']/gm) ?? [];
  // Chi duoc phep import gi noi bo da ghep lai
  const external = imports.filter((l) => !/["']\.?\/?(src|workers)\//.test(l));
  assert.deepEqual(external, [], 'con import khong ghep: ' + external.join(' | '));
});

test('bundle: chay duoc va tra 404 cho route la', async () => {
  const mod = await loadBundled();
  const worker = mod.default;
  assert.equal(typeof worker.fetch, 'function');

  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const res = await worker.fetch(new Request('https://x.test/khong-ton-tai'), {});
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'NOT_FOUND');
});

test('bundle: /health chay va bao cao upstream', async () => {
  const mod = await loadBundled();
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const res = await mod.default.fetch(new Request('https://x.test/health'), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.service, 'av-api');
  assert.equal(body.platform, 'AV');
});

test.after(() => { globalThis.fetch = REAL_FETCH; });
