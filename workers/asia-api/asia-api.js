// ============================================================
// ANIGLOBAL — asia-api
// Worker gom du lieu khu vuc ASIA.
//
// Day la FILE DEPLOY. Khong can build, khong can bundler:
//   Cloudflare Dashboard > Worker "asia-api" > Edit code > Paste > Deploy
//
// Worker nay la adapter NOI BO. No goi cac worker ANIVIET da deploy, chuan hoa
// ket qua ve canonical model cua ANIGLOBAL roi tra ve bang canonical ID
// (ag_anime_1, ag_character_1, ...).
//
// ANIGLOBAL API (cong khai) goi vao day. Nguoi dung API khong bao gio goi truc
// tiep vao tung worker ANIVIET — nho do doi mot worker ben trong khong lam
// doi contract public.
//
// D1 binding: DB -> aniglobal-asia
// ============================================================

// ============================================================
// CONFIG
// ============================================================

const REGION = 'ASIA';

/** Cac worker ANIVIET trong khu vuc ASIA. */
const UPSTREAM = {
  content: 'https://content-worker.aniviet.workers.dev',
  auth: 'https://sginup-loginsystem.aniviet.workers.dev',
  watchparty: 'https://aniviet-watchparty.aniviet.workers.dev',
  shop: 'https://shop-system.aniviet.workers.dev',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '600',
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const fail = (status, error, message) => json({ error, message }, status);

// ============================================================
// ID MAPPING — du lieu goc -> canonical ID cua ANIGLOBAL
// ============================================================

const KINDS = ['anime', 'manga', 'character', 'staff', 'studio', 'producer', 'relation'];

/** So thu tu da cap lon nhat, theo tung loai. */
const MAX_ID = {};
for (const k of KINDS) MAX_ID[k] = 0;

function stableHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Tra canonical ID cho mot `sourceId`.
 * Co D1: mapping duoc luu, ID on dinh va khong bao gio dung lai.
 * Khong co D1: ID sinh tu hash — chi dung cho dev, khong on dinh giua cac lan
 * deploy, nen thieu D1 se ghi ro trong /health.
 */
async function mapId(db, kind, sourceId) {
  const key = kind + ':' + sourceId;

  if (!db) return 'ag_' + kind + '_' + stableHash(key);

  const row = await db
    .prepare('SELECT canonical_id FROM id_map WHERE key = ?')
    .bind(key)
    .first();

  if (row && row.canonical_id) return row.canonical_id;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO id_map (key, kind, canonical_id, created_at) VALUES (?, ?, ?, ?)'
  );

  let assigned = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    assigned = (MAX_ID[kind] || 0) + 1;
    MAX_ID[kind] = assigned;
    const id = 'ag_' + kind + '_' + assigned;
    const res = await stmt.bind(key, kind, id, Date.now()).run();
    if (((res.meta && res.meta.changes) || 0) > 0) return id;
  }

  return 'ag_' + kind + '_' + assigned;
}

async function ensureIdSchema(db) {
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS id_map (' +
        'key TEXT PRIMARY KEY, ' +
        'kind TEXT NOT NULL, ' +
        'canonical_id TEXT NOT NULL UNIQUE, ' +
        'created_at INTEGER NOT NULL)'
    )
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_id_map_kind ON id_map (kind, canonical_id)')
    .run();
}

/** Doc so lon nhat da cap tu DB, phong vie ID moi trung ID cu khi worker restart. */
async function loadMaxIds(db) {
  for (const kind of KINDS) {
    const row = await db
      .prepare('SELECT canonical_id FROM id_map WHERE kind = ? ORDER BY canonical_id DESC LIMIT 1')
      .bind(kind)
      .first();
    if (row && row.canonical_id) {
      const n = Number(String(row.canonical_id).split('_').pop());
      if (Number.isFinite(n)) MAX_ID[kind] = n;
    }
  }
}

// ============================================================
// SOURCE ADAPTERS
// ============================================================

async function callUpstream(url, timeoutMs, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
  try {
    const res = await fetch(url, {
      headers: Object.assign({ Accept: 'application/json' }, headers || {}),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('upstream HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function sourceIdOf(raw) {
  return raw.slug || raw.source_id || String(raw.id != null ? raw.id : '');
}

/** Doc anilistId tu external_ids neu content worker co cung cap. */
function anilistIdOf(raw) {
  for (const e of raw.external_ids || []) {
    if (e.provider === 'anilist') {
      const n = Number(e.external_id);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Chuan hoa mot ban ghi content worker thanh canonical model. */
async function normalizeContent(db, raw) {
  const kind = raw.type === 'manga' ? 'manga' : 'anime';
  const id = await mapId(db, kind, sourceIdOf(raw));

  return {
    id,
    region: REGION,
    type: kind === 'anime' ? 'anime' : 'manga',
    title: {
      romaji: raw.title != null ? raw.title : null,
      english: null,
      native: null,
      localized: null,
    },
    description: raw.description || null,
    cover: raw.cover || null,
    banner: raw.banner || null,
    status: raw.status || null,
    releaseYear: raw.release_year != null ? raw.release_year : null,
    rating: raw.rating || null,
    anilistId: anilistIdOf(raw),
    genres: [],
    synonyms: [],
    // Chi tiet trien khai — KHONG phai contract public
    source: raw.source || null,
    sourceId: raw.source_id || null,
    slug: raw.slug || null,
  };
}

// ============================================================
// ROUTES
// ============================================================

const routes = {
  '/health': async (_req, env) => {
    const rows = await Promise.all(
      Object.entries(UPSTREAM).map(async (entry) => {
        const name = entry[0];
        const base = entry[1];
        try {
          const r = await fetch(base + '/', { signal: AbortSignal.timeout(6000) });
          return [name, r.status];
        } catch (_) {
          return [name, 0];
        }
      })
    );
    return json({
      service: 'asia-api',
      region: REGION,
      ok: true,
      d1: !!env.DB,
      idMappingPersistent: !!env.DB,
      upstream: Object.fromEntries(rows),
    });
  },

  '/internal/asia/content': async (_req, env, url) => {
    const type = url.searchParams.get('type');
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const q = url.searchParams.get('q') || '';

    const sp = new URLSearchParams({ page, limit });
    if (type) sp.set('type', type);
    if (q) sp.set('q', q);

    const raw = await callUpstream(UPSTREAM.content + '/api/content?' + sp);

    const items = [];
    for (const r of raw.items || []) items.push(await normalizeContent(env.DB, r));

    return json({
      region: REGION,
      items,
      total: raw.total != null ? raw.total : items.length,
      page: raw.page != null ? raw.page : 1,
      limit: raw.limit != null ? raw.limit : items.length,
      pages: raw.pages != null ? raw.pages : 1,
    });
  },

  '/internal/asia/search': async (_req, env, url) => {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return fail(400, 'INVALID_ARGUMENT', 'Thieu tham so "q"');
    const limit = url.searchParams.get('limit') || '20';
    const sp = new URLSearchParams({ q, page: '1', limit });
    const raw = await callUpstream(UPSTREAM.content + '/api/content?' + sp);
    const items = [];
    for (const r of raw.items || []) items.push(await normalizeContent(env.DB, r));
    return json({ region: REGION, query: q, items, total: raw.total != null ? raw.total : items.length });
  },

  /**
   * Xac thuc developer. Token den tu he thong user cua ANIVIET — ANIGLOBAL
   * dung chung mot he thong dang nhap, khong co account rieng.
   */
  '/internal/asia/verify-user': async (req, _env) => {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return fail(400, 'CLIENT_KEY_REQUIRED', 'Thieu Bearer token');
    try {
      const user = await callUpstream(
        UPSTREAM.auth + '/api/auth/me',
        10000,
        { Authorization: 'Bearer ' + token }
      );
      return json({ ok: true, user: user.user || null });
    } catch (_) {
      return fail(401, 'INVALID_CLIENT_KEY', 'Token khong hop le');
    }
  },
};

// ============================================================
// MAIN
// ============================================================

let schemaReady = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (env.DB && !schemaReady) {
      try {
        await ensureIdSchema(env.DB);
        await loadMaxIds(env.DB);
        schemaReady = true;
      } catch (e) {
        console.error('id_map setup failed', e);
      }
    }

    const handler = routes[path];
    if (!handler) return fail(404, 'NOT_FOUND', 'Khong co route ' + path);

    try {
      return await handler(request, env, url);
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      console.error('asia-api error', path, message);
      const upstreamDown = /upstream HTTP|fetch failed|aborted/i.test(message);
      return fail(
        upstreamDown ? 502 : 500,
        upstreamDown ? 'UPSTREAM_ERROR' : 'INTERNAL_ERROR',
        message
      );
    }
  },
};
