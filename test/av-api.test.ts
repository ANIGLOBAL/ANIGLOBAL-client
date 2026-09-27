import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../workers/av-api/src/index.ts';

const REAL_FETCH = globalThis.fetch;

type Route = (url: string, init?: RequestInit) => Response;

/** Duong dan goc cua module de kiem tra import dung chuong trinh. */
const CONTENT_BASE = 'https://content-worker.aniviet.workers.dev';
const AUTH_BASE = 'https://sginup-loginsystem.aniviet.workers.dev';

function makeEnv(withD1: boolean) {
  if (!withD1) return {};
  // D1 gia lap: bang trong bo nho, chi can du dung cho id_map.
  const tables = new Map<string, Map<string, any>>();
  const t = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  const exec = () => ({ success: true });
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (/FROM id_map WHERE key/.test(sql)) return t('id_map').get(args[0]) ?? null;
            if (/ORDER BY canonical_id DESC/.test(sql)) return null;
            return null;
          },
          run: async () => {
            if (/INSERT OR IGNORE INTO id_map/.test(sql)) {
              const [key, , id] = args;
              if (t('id_map').has(key)) return { success: true, meta: { changes: 0 } };
              t('id_map').set(key, { key, canonical_id: id });
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 1 } };
          },
          all: async () => ({ results: [] }),
        }),
        first: async () => null,
        run: exec,
        all: async () => ({ results: [] }),
      }),
      exec: exec,
    },
  } as unknown as Env;
}

type Env = Record<string, unknown>;

function stubFetch(handler: Route) {
  globalThis.fetch = (async (input: any, init?: any) => handler(String(input?.url ?? input), init)) as typeof fetch;
}

async function call(path: string, init: RequestInit = {}, withD1 = false, env?: Env) {
  const res = await worker.fetch(
    new Request(`https://av-api.test${path}`, init),
    (env ?? makeEnv(withD1)) as never
  );
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

test('av-api: OPTIONS -> 204', async () => {
  const r = await call('/health', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
});

test('av-api: route la -> 404 NOT_FOUND', async () => {
  const r = await call('/khong-ton-tai');
  assert.equal(r.status, 404);
  assert.equal(r.data.error, 'NOT_FOUND');
});

test('av-api: /health bao cac upstream', async () => {
  stubFetch((url) => new Response('{}', { status: 200 }));
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.service, 'av-api');
  assert.equal(r.data.platform, 'AV');
  assert.equal(r.data.ok, true);
  assert.ok(r.data.upstream.content, 'phai co key content');
});

test('av-api: /health van 200 khi upstream chet', async () => {
  stubFetch(() => { throw new Error('fetch failed'); });
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.upstream.content, 0);
});

test('av-api: chuan hoa content -> canonical ID ag_anime_N', async () => {
  stubFetch((url) => {
    if (url.startsWith(CONTENT_BASE)) {
      return new Response(
        JSON.stringify({
          items: [
            { id: 194, type: 'anime', title: 'Kanojo mo Kanojo', slug: 'anime-universal-kmk', cover: 'c.jpg', status: 'ongoing', source: 'v4' },
            { id: 7, type: 'manga', title: 'Doraemon', slug: 'manga-doraemon', cover: 'd.jpg' },
          ],
          total: 2, page: 1, limit: 2, pages: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 200 });
  });

  const r = await call('/internal/av/content?limit=2', {}, true);
  assert.equal(r.status, 200);
  assert.equal(r.data.platform, 'AV');
  assert.equal(r.data.items.length, 2);

  const anime = r.data.items[0];
  assert.match(anime.id, /^ag_anime_\d+$/);
  assert.equal(anime.type, 'anime');
  assert.equal(anime.title.romaji, 'Kanojo mo Kanojo');
  assert.equal(anime.slug, 'anime-universal-kmk');

  const manga = r.data.items[1];
  assert.match(manga.id, /^ag_manga_\d+$/);
  assert.equal(manga.type, 'manga');
});

test('av-api: ID on dinh giua hai lan goi (cung slug -> cung ID)', async () => {
  const payload = JSON.stringify({
    items: [{ id: 1, type: 'anime', title: 'A', slug: 'same-slug' }],
    total: 1, page: 1, limit: 1, pages: 1,
  });
  stubFetch(() => new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } }));

  // Dung CHUNG mot D1 cho ca hai lan goi — trong thuc te D1 la toan cuc.
  const env = makeEnv(true);
  const a = await call('/internal/av/content?limit=1', {}, true, env);
  const b = await call('/internal/av/content?limit=1', {}, true, env);
  assert.equal(a.data.items[0].id, b.data.items[0].id);
});

test('av-api: slug khac -> ID khac', async () => {
  const env = makeEnv(true);
  const one = JSON.stringify({ items: [{ id: 1, type: 'anime', title: 'A', slug: 'slug-a' }], total: 1, page: 1, limit: 1, pages: 1 });
  const two = JSON.stringify({ items: [{ id: 2, type: 'anime', title: 'B', slug: 'slug-b' }], total: 1, page: 1, limit: 1, pages: 1 });
  let call_ = 0;
  stubFetch(() => new Response(call_++ === 0 ? one : two, { status: 200, headers: { 'Content-Type': 'application/json' } }));

  const a = await call('/internal/av/content?limit=1', {}, true, env);
  const b = await call('/internal/av/content?limit=1', {}, true, env);
  assert.notEqual(a.data.items[0].id, b.data.items[0].id);
});

test('av-api: lay anilistId tu external_ids', async () => {
  stubFetch(() =>
    new Response(
      JSON.stringify({
        items: [{ id: 1, type: 'anime', title: 'A', slug: 's', external_ids: [{ provider: 'anilist', external_id: '15583' }] }],
        total: 1, page: 1, limit: 1, pages: 1,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
  const r = await call('/internal/av/content?limit=1', {}, true);
  assert.equal(r.data.items[0].anilistId, 15583);
});

test('av-api: upstream chet -> 502 UPSTREAM_ERROR', async () => {
  stubFetch(() => { throw new Error('fetch failed'); });
  const r = await call('/internal/av/content?limit=1');
  assert.equal(r.status, 502);
  assert.equal(r.data.error, 'UPSTREAM_ERROR');
});

test('av-api: upstream tra 500 -> 502', async () => {
  stubFetch(() => new Response('{"error":"db"}', { status: 500 }));
  const r = await call('/internal/av/content?limit=1');
  assert.equal(r.status, 502);
  assert.equal(r.data.error, 'UPSTREAM_ERROR');
});

test('av-api: search thieu q -> 400', async () => {
  stubFetch(() => new Response('{}', { status: 200 }));
  const r = await call('/internal/av/search');
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'INVALID_ARGUMENT');
});

test('av-api: verify-user chuyen tiep Bearer token sang ANIVIET auth', async () => {
  let seen: string | null = null;
  stubFetch((url, init) => {
    if (url.startsWith(AUTH_BASE)) {
      const h = (init as any)?.headers ?? {};
      seen = h.Authorization ?? (h as any).authorization ?? null;
      return new Response(JSON.stringify({ user: { id: 1, email: 'a@b.co', role: 'user' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200 });
  });

  const r = await call('/internal/av/verify-user', { headers: { Authorization: 'Bearer tok-123' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.user.email, 'a@b.co');
  assert.equal(seen, 'Bearer tok-123', 'phai chuyen nguyen token sang ANIVIET');
});

test('av-api: verify-user thieu token -> 400', async () => {
  stubFetch(() => new Response('{}', { status: 200 }));
  const r = await call('/internal/av/verify-user');
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'CLIENT_KEY_REQUIRED');
});

test('av-api: verify-user token sai -> 401', async () => {
  stubFetch((url) =>
    url.startsWith(AUTH_BASE)
      ? new Response('{"error":"Token khong hop le"}', { status: 401 })
      : new Response('{}', { status: 200 })
  );
  const r = await call('/internal/av/verify-user', { headers: { Authorization: 'Bearer bad' } });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'INVALID_CLIENT_KEY');
});

test('av-api: chay duoc khi khong co D1', async () => {
  stubFetch(() =>
    new Response(
      JSON.stringify({ items: [{ id: 1, type: 'anime', title: 'A', slug: 's' }], total: 1, page: 1, limit: 1, pages: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
  const r = await call('/internal/av/content?limit=1', {}, false);
  assert.equal(r.status, 200);
  assert.match(r.data.items[0].id, /^ag_anime_\d+$/);
});

test.after(() => { globalThis.fetch = REAL_FETCH; });
