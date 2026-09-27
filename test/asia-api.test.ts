import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../workers/asia-api/asia-api.js';

const REAL_FETCH = globalThis.fetch;

const CONTENT_BASE = 'https://content-worker.aniviet.workers.dev';
const AUTH_BASE = 'https://sginup-loginsystem.aniviet.workers.dev';

/** D1 gia lap: bang trong bo nho, du dung cho id_map. */
function makeD1() {
  const rows = new Map<string, { key: string; canonical_id: string }>();
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (/FROM id_map WHERE key/.test(sql)) return rows.get(String(args[0])) ?? null;
          if (/ORDER BY canonical_id DESC/.test(sql)) return null;
          return null;
        },
        run: async () => {
          if (/INSERT OR IGNORE INTO id_map/.test(sql)) {
            const key = String(args[0]);
            const id = String(args[2]);
            if (rows.has(key)) return { success: true, meta: { changes: 0 } };
            rows.set(key, { key, canonical_id: id });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
        all: async () => ({ results: [] }),
      }),
      first: async () => null,
      run: async () => ({ success: true, meta: { changes: 1 } }),
      all: async () => ({ results: [] }),
    }),
    exec: async () => ({ success: true }),
  };
}

function stubFetch(handler: (url: string, init?: unknown) => Response) {
  globalThis.fetch = (async (input: unknown, init: unknown) =>
    handler(String((input as { url?: string })?.url ?? input), init)) as typeof fetch;
}

async function call(path: string, init: RequestInit = {}, env: Record<string, unknown> = {}) {
  const res = await worker.fetch(new Request('https://asia-api.test' + path, init), env);
  // JSON tu worker nen de `any` — assert truc tiep tren shape that tra ve.
  // den (any) giup doc test gon nhu chu ky assert.
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

const CONTENT_JSON = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('asia-api: OPTIONS -> 204', async () => {
  assert.equal((await call('/health', { method: 'OPTIONS' })).status, 204);
});

test('asia-api: route la -> 404 NOT_FOUND', async () => {
  const r = await call('/khong-ton-tai');
  assert.equal(r.status, 404);
  assert.equal(r.data.error, 'NOT_FOUND');
});

test('asia-api: /health bao service + region', async () => {
  stubFetch(() => new Response('{}', { status: 200 }));
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.service, 'asia-api');
  assert.equal(r.data.region, 'ASIA');
  assert.equal(r.data.ok, true);
  assert.ok(r.data.upstream.content !== undefined);
});

test('asia-api: /health bao d1=false khi chua gan binding', async () => {
  stubFetch(() => new Response('{}', { status: 200 }));
  const r = await call('/health', {}, {});
  assert.equal(r.data.d1, false);
  assert.equal(r.data.idMappingPersistent, false);
});

test('asia-api: /health bao d1=true khi co binding', async () => {
  stubFetch(() => new Response('{}', { status: 200 }));
  const r = await call('/health', {}, { DB: makeD1() });
  assert.equal(r.data.d1, true);
  assert.equal(r.data.idMappingPersistent, true);
});

test('asia-api: /health van 200 khi upstream chet', async () => {
  stubFetch(() => { throw new Error('fetch failed'); });
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.upstream.content, 0);
});

test('asia-api: chuan hoa content -> ag_anime_N / ag_manga_N', async () => {
  stubFetch((url) => {
    if (url.startsWith(CONTENT_BASE)) {
      return CONTENT_JSON({
        items: [
          { id: 194, type: 'anime', title: 'Kanojo mo Kanojo', slug: 'anime-universal-kmk', cover: 'c.jpg', status: 'ongoing', source: 'v4' },
          { id: 7, type: 'manga', title: 'Doraemon', slug: 'manga-doraemon', cover: 'd.jpg' },
        ],
        total: 2, page: 1, limit: 2, pages: 1,
      });
    }
    return new Response('{}', { status: 200 });
  });

  const r = await call('/internal/asia/content?limit=2', {}, { DB: makeD1() });
  assert.equal(r.status, 200);
  assert.equal(r.data.region, 'ASIA');
  assert.equal(r.data.items.length, 2);

  const anime = r.data.items[0];
  assert.match(anime.id, /^ag_anime_\d+$/);
  assert.equal(anime.type, 'anime');
  assert.equal(anime.region, 'ASIA');
  assert.equal(anime.title.romaji, 'Kanojo mo Kanojo');
  assert.equal(anime.slug, 'anime-universal-kmk');

  const manga = r.data.items[1];
  assert.match(manga.id, /^ag_manga_\d+$/);
  assert.equal(manga.type, 'manga');
});

test('asia-api: ID on dinh giua hai lan goi (cung slug -> cung ID)', async () => {
  stubFetch(() =>
    CONTENT_JSON({ items: [{ id: 1, type: 'anime', title: 'A', slug: 'same' }], total: 1, page: 1, limit: 1, pages: 1 })
  );
  // Dung CHUNG mot D1 cho ca hai lan goi — D1 la toan cuc trong thuc te.
  const env = { DB: makeD1() };
  const a = await call('/internal/asia/content?limit=1', {}, env);
  const b = await call('/internal/asia/content?limit=1', {}, env);
  assert.equal(a.data.items[0].id, b.data.items[0].id);
});

test('asia-api: slug khac -> ID khac', async () => {
  const env = { DB: makeD1() };
  const one = JSON.stringify({ items: [{ id: 1, type: 'anime', title: 'A', slug: 'slug-a' }], total: 1, page: 1, limit: 1, pages: 1 });
  const two = JSON.stringify({ items: [{ id: 2, type: 'anime', title: 'B', slug: 'slug-b' }], total: 1, page: 1, limit: 1, pages: 1 });
  let n = 0;
  stubFetch(() => CONTENT_JSON(JSON.parse(n++ === 0 ? one : two)));

  const a = await call('/internal/asia/content?limit=1', {}, env);
  const b = await call('/internal/asia/content?limit=1', {}, env);
  assert.notEqual(a.data.items[0].id, b.data.items[0].id);
});

test('asia-api: lay anilistId tu external_ids', async () => {
  stubFetch(() =>
    CONTENT_JSON({
      items: [{ id: 1, type: 'anime', title: 'A', slug: 's', external_ids: [{ provider: 'anilist', external_id: '15583' }] }],
      total: 1, page: 1, limit: 1, pages: 1,
    })
  );
  const r = await call('/internal/asia/content?limit=1', {}, { DB: makeD1() });
  assert.equal(r.data.items[0].anilistId, 15583);
});

test('asia-api: upstream chet -> 502 UPSTREAM_ERROR', async () => {
  stubFetch(() => { throw new Error('fetch failed'); });
  const r = await call('/internal/asia/content?limit=1');
  assert.equal(r.status, 502);
  assert.equal(r.data.error, 'UPSTREAM_ERROR');
});

test('asia-api: upstream tra 500 -> 502', async () => {
  stubFetch(() => new Response('{"error":"db"}', { status: 500 }));
  const r = await call('/internal/asia/content?limit=1');
  assert.equal(r.status, 502);
});

test('asia-api: search thieu q -> 400', async () => {
  stubFetch(() => new Response('{}', { status: 200 }));
  const r = await call('/internal/asia/search');
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'INVALID_ARGUMENT');
});

test('asia-api: verify-user chuyen tiep Bearer token sang ANIVIET', async () => {
  let seen: string | null = null;
  stubFetch((url, init) => {
    if (url.startsWith(AUTH_BASE)) {
      const h = ((init as { headers?: Record<string, string> } | undefined)?.headers) ?? {};
      seen = h.Authorization || h.authorization || null;
      return CONTENT_JSON({ user: { id: 1, email: 'a@b.co', role: 'user' } });
    }
    return new Response('{}', { status: 200 });
  });

  const r = await call('/internal/asia/verify-user', { headers: { Authorization: 'Bearer tok-123' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.user.email, 'a@b.co');
  assert.equal(seen, 'Bearer tok-123', 'phai chuyen nguyen token sang ANIVIET');
});

test('asia-api: verify-user thieu token -> 400', async () => {
  stubFetch(() => new Response('{}', { status: 200 }));
  const r = await call('/internal/asia/verify-user');
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'CLIENT_KEY_REQUIRED');
});

test('asia-api: verify-user token sai -> 401', async () => {
  stubFetch((url) =>
    url.startsWith(AUTH_BASE) ? new Response('{"error":"sai"}', { status: 401 }) : new Response('{}', { status: 200 })
  );
  const r = await call('/internal/asia/verify-user', { headers: { Authorization: 'Bearer bad' } });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'INVALID_CLIENT_KEY');
});

test('asia-api: chay duoc khi khong co D1 (dev)', async () => {
  stubFetch(() =>
    CONTENT_JSON({ items: [{ id: 1, type: 'anime', title: 'A', slug: 's' }], total: 1, page: 1, limit: 1, pages: 1 })
  );
  const r = await call('/internal/asia/content?limit=1', {}, {});
  assert.equal(r.status, 200);
  assert.match(r.data.items[0].id, /^ag_anime_\d+$/);
});

test('asia-api: file deploy khong can build (khong co import ben ngoai)', async () => {
  const src = await (await import('node:fs/promises')).readFile('workers/asia-api/asia-api.js', 'utf8');
  const imports = src.match(/^\s*import\s.*from\s*["']/gm) || [];
  assert.deepEqual(imports, [], 'file deploy phai tu chua, khong import gi: ' + imports.join(' | '));
});

test.after(() => { globalThis.fetch = REAL_FETCH; });
