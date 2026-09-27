/**
 * av-api — worker gom du lieu nen tang AV (ANIVIET).
 *
 * Worker nay la ADAPTER noi bo. No goi cac worker ANIVIET da deploy, chuan hoa
 * ket qua ve canonical model cua ANIGLOBAL roi tra ve bang canonical ID
 * (ag_anime_1, ag_character_1, ...).
 *
 * ANIGLOBAL API (cong khai) goi vao day. Nguoi dung API khong bao gio goi truc
 * tiep vao tung worker ANIVIET — nho do doi mot worker ben trong khong lam
 * doi contract public.
 *
 * Deploy: Cloudflare Dashboard > Worker "av-api" > Edit code > Paste av-api.js
 */

import type { CanonicalKind } from '../../../src/core/ids/canonical.ts';

// ============================================================
// CONFIG
// ============================================================

/** Cac worker AV dang chay. Ghi de bang env vars neu doi dia chi. */
const UPSTREAM = {
  content: 'https://content-worker.aniviet.workers.dev',
  auth: 'https://sginup-loginsystem.aniviet.workers.dev',
  watchparty: 'https://aniviet-watchparty.aniviet.workers.dev',
  shop: 'https://shop-system.aniviet.workers.dev',
};

const PLATFORM = 'AV' as const;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '600',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const fail = (status: number, error: string, message: string) =>
  json({ error, message }, status);

// ============================================================
// ID MAPPING
// ============================================================

/**
 * Chi so ID giup ANIGLOBAL khong phu thuoc vao ID cua nguon.
 * Key = `${kind}:${sourceId}` (slug / anilistId / path), value = so thu tu da cap.
 *
 * `MAX_ID` la khoi dong; nen tang len dan theo so ban ghi thuc te.
 */
const MAX_ID: Record<CanonicalKind, number> = {
  anime: 0,
  manga: 0,
  character: 0,
  staff: 0,
  studio: 0,
  producer: 0,
  relation: 0,
};

interface Env {
  DB?: D1Database;
}

async function mapId(db: D1Database | undefined, kind: CanonicalKind, sourceId: string): Promise<string> {
  const key = `${kind}:${sourceId}`;

  if (!db) {
    // Khong co D1: tao ID tam thoi de van chay duoc, khong on dinh giua cac
    // lan deploy. Chi dung cho local/dev.
    return `ag_${kind}_${stableHash(key)}`;
  }

  const row = await db
    .prepare('SELECT canonical_id FROM id_map WHERE key = ?')
    .bind(key)
    .first<{ canonical_id: string }>();

  if (row?.canonical_id) return row.canonical_id;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO id_map (key, kind, canonical_id, created_at) VALUES (?, ?, ?, ?)'
  );
  let assigned = 0;

  for (let attempt = 0; attempt < 5; attempt++) {
    assigned = (MAX_ID[kind] ?? 0) + 1;
    MAX_ID[kind] = assigned;
    const id = `ag_${kind}_${assigned}`;
    const res = await stmt.bind(key, kind, id, Date.now()).run();
    if ((res.meta?.changes ?? 0) > 0) return id;
  }

  return `ag_${kind}_${assigned}`;
}

async function ensureIdSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS id_map (
         key TEXT PRIMARY KEY,
         kind TEXT NOT NULL,
         canonical_id TEXT NOT NULL UNIQUE,
         created_at INTEGER NOT NULL
       )`
    )
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_id_map_kind ON id_map (kind, canonical_id)')
    .run();
}

/** Doc max da cap tu DB de worker khong restart lam ID cu khong trung ID moi. */
async function loadMaxIds(db: D1Database) {
  for (const kind of Object.keys(MAX_ID) as CanonicalKind[]) {
    const row = await db
      .prepare('SELECT canonical_id FROM id_map WHERE kind = ? ORDER BY canonical_id DESC LIMIT 1')
      .bind(kind)
      .first<{ canonical_id: string }>();
    if (row?.canonical_id) {
      const n = Number(row.canonical_id.split('_').pop());
      if (Number.isFinite(n)) MAX_ID[kind] = n;
    }
  }
}

function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ============================================================
// SOURCE ADAPTERS
// ============================================================

interface RawContent {
  id?: number;
  type?: string;
  title?: string;
  slug?: string;
  description?: string;
  cover?: string;
  banner?: string;
  status?: string;
  release_year?: number | null;
  rating?: number;
  source?: string;
  source_id?: string;
  external_ids?: Array<{ provider: string; external_id: string }>;
}

interface PagedRaw<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

async function callUpstream<T>(
  url: string,
  timeoutMs = 12000,
  headers: Record<string, string> = {}
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function sourceIdOf(raw: RawContent): string {
  return raw.slug || raw.source_id || String(raw.id ?? '');
}

// ============================================================
// CHUAN HOA
// ============================================================

function toTitle(raw: RawContent) {
  return {
    romaji: raw.title ?? null,
    english: null,
    native: null,
    localized: null,
  };
}

function anilistIdOf(raw: RawContent): number | null {
  for (const e of raw.external_ids ?? []) {
    if (e.provider === 'anilist') {
      const n = Number(e.external_id);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function normalizeContent(
  db: D1Database | undefined,
  raw: RawContent
): Promise<Record<string, unknown>> {
  const kind: CanonicalKind = raw.type === 'manga' ? 'manga' : 'anime';
  const id = await mapId(db, kind, sourceIdOf(raw));

  return {
    id,
    platform: PLATFORM,
    type: kind === 'manga' ? 'manga' : 'anime',
    title: toTitle(raw),
    description: raw.description || null,
    cover: raw.cover || null,
    banner: raw.banner || null,
    status: raw.status || null,
    releaseYear: raw.release_year ?? null,
    rating: raw.rating || null,
    anilistId: anilistIdOf(raw),
    genres: [],
    synonyms: [],
    // Chi tiot trien khai — KHONG phai contract public
    source: raw.source ?? null,
    sourceId: raw.source_id ?? null,
    slug: raw.slug ?? null,
  };
}

// ============================================================
// ROUTES
// ============================================================

type Handler = (req: Request, env: Env, url: URL) => Promise<Response>;

const routes: Record<string, Handler> = {
  '/health': async (_req, env) => {
    const rows = await Promise.all(
      Object.entries(UPSTREAM).map(async ([name, base]) => {
        try {
          const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(6000) });
          return [name, r.status];
        } catch {
          return [name, 0];
        }
      })
    );
    return json({
      service: 'av-api',
      platform: PLATFORM,
      ok: true,
      d1: !!env.DB,
      upstream: Object.fromEntries(rows),
    });
  },

  '/internal/av/content': async (_req, env, url) => {
    const type = url.searchParams.get('type');
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const q = url.searchParams.get('q') || '';

    const sp = new URLSearchParams({ page, limit });
    if (type) sp.set('type', type);
    if (q) sp.set('q', q);

    const raw = await callUpstream<PagedRaw<RawContent>>(
      `${UPSTREAM.content}/api/content?${sp}`
    );

    const items: Record<string, unknown>[] = [];
    for (const r of raw.items ?? []) items.push(await normalizeContent(env.DB, r));

    return json({
      platform: PLATFORM,
      items,
      total: raw.total ?? items.length,
      page: raw.page ?? 1,
      limit: raw.limit ?? items.length,
      pages: raw.pages ?? 1,
    });
  },

  '/internal/av/search': async (_req, env, url) => {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return fail(400, 'INVALID_ARGUMENT', 'Thieu tham so "q"');
    const limit = url.searchParams.get('limit') || '20';
    const sp = new URLSearchParams({ q, page: '1', limit });
    const raw = await callUpstream<PagedRaw<RawContent>>(
      `${UPSTREAM.content}/api/content?${sp}`
    );
    const items: Record<string, unknown>[] = [];
    for (const r of raw.items ?? []) items.push(await normalizeContent(env.DB, r));
    return json({ platform: PLATFORM, query: q, items, total: raw.total ?? items.length });
  },

  /** Xac thuc developer lay token cua ANIVIET (dung chung he thong user). */
  '/internal/av/verify-user': async (req, _env) => {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return fail(400, 'CLIENT_KEY_REQUIRED', 'Thieu Bearer token');
    try {
      const user = await callUpstream<{ user?: Record<string, unknown> }>(
        `${UPSTREAM.auth}/api/auth/me`,
        10000,
        { Authorization: `Bearer ${token}` }
      );
      return json({ ok: true, user: user.user ?? null });
    } catch {
      return fail(401, 'INVALID_CLIENT_KEY', 'Token khong hop le');
    }
  },
};

// ============================================================
// MAIN
// ============================================================

let schemaReady = false;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
    if (!handler) {
      return fail(404, 'NOT_FOUND', `Khong co route ${path}`);
    }

    try {
      return await handler(request, env, url);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('av-api error', path, message);
      const upstreamDown = /upstream HTTP|fetch failed|aborted/i.test(message);
      return fail(
        upstreamDown ? 502 : 500,
        upstreamDown ? 'UPSTREAM_ERROR' : 'INTERNAL_ERROR',
        message
      );
    }
  },
};
