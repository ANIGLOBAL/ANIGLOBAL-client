var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var UPSTREAM = {
  content: "https://content-worker.aniviet.workers.dev",
  auth: "https://sginup-loginsystem.aniviet.workers.dev",
  watchparty: "https://aniviet-watchparty.aniviet.workers.dev",
  shop: "https://shop-system.aniviet.workers.dev"
};
var PLATFORM = "AV";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age": "600"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}
__name(json, "json");
var fail = /* @__PURE__ */ __name((status, error, message) => json({ error, message }, status), "fail");
var MAX_ID = {
  anime: 0,
  manga: 0,
  character: 0,
  staff: 0,
  studio: 0,
  producer: 0,
  relation: 0
};
async function mapId(db, kind, sourceId) {
  const key = `${kind}:${sourceId}`;
  if (!db) {
    return `ag_${kind}_${stableHash(key)}`;
  }
  const row = await db.prepare("SELECT canonical_id FROM id_map WHERE key = ?").bind(key).first();
  if (row?.canonical_id) return row.canonical_id;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO id_map (key, kind, canonical_id, created_at) VALUES (?, ?, ?, ?)"
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
__name(mapId, "mapId");
async function ensureIdSchema(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS id_map (
         key TEXT PRIMARY KEY,
         kind TEXT NOT NULL,
         canonical_id TEXT NOT NULL UNIQUE,
         created_at INTEGER NOT NULL
       )`
  ).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_id_map_kind ON id_map (kind, canonical_id)").run();
}
__name(ensureIdSchema, "ensureIdSchema");
async function loadMaxIds(db) {
  for (const kind of Object.keys(MAX_ID)) {
    const row = await db.prepare("SELECT canonical_id FROM id_map WHERE kind = ? ORDER BY canonical_id DESC LIMIT 1").bind(kind).first();
    if (row?.canonical_id) {
      const n = Number(row.canonical_id.split("_").pop());
      if (Number.isFinite(n)) MAX_ID[kind] = n;
    }
  }
}
__name(loadMaxIds, "loadMaxIds");
function stableHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
__name(stableHash, "stableHash");
async function callUpstream(url, timeoutMs = 12e3, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
__name(callUpstream, "callUpstream");
function sourceIdOf(raw) {
  return raw.slug || raw.source_id || String(raw.id ?? "");
}
__name(sourceIdOf, "sourceIdOf");
function toTitle(raw) {
  return {
    romaji: raw.title ?? null,
    english: null,
    native: null,
    localized: null
  };
}
__name(toTitle, "toTitle");
function anilistIdOf(raw) {
  for (const e of raw.external_ids ?? []) {
    if (e.provider === "anilist") {
      const n = Number(e.external_id);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}
__name(anilistIdOf, "anilistIdOf");
async function normalizeContent(db, raw) {
  const kind = raw.type === "manga" ? "manga" : "anime";
  const id = await mapId(db, kind, sourceIdOf(raw));
  return {
    id,
    platform: PLATFORM,
    type: kind === "manga" ? "manga" : "anime",
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
    slug: raw.slug ?? null
  };
}
__name(normalizeContent, "normalizeContent");
var routes = {
  "/health": /* @__PURE__ */ __name(async (_req, env) => {
    const rows = await Promise.all(
      Object.entries(UPSTREAM).map(async ([name, base]) => {
        try {
          const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(6e3) });
          return [name, r.status];
        } catch {
          return [name, 0];
        }
      })
    );
    return json({
      service: "av-api",
      platform: PLATFORM,
      ok: true,
      d1: !!env.DB,
      upstream: Object.fromEntries(rows)
    });
  }, "/health"),
  "/internal/av/content": /* @__PURE__ */ __name(async (_req, env, url) => {
    const type = url.searchParams.get("type");
    const page = url.searchParams.get("page") || "1";
    const limit = url.searchParams.get("limit") || "20";
    const q = url.searchParams.get("q") || "";
    const sp = new URLSearchParams({ page, limit });
    if (type) sp.set("type", type);
    if (q) sp.set("q", q);
    const raw = await callUpstream(
      `${UPSTREAM.content}/api/content?${sp}`
    );
    const items = [];
    for (const r of raw.items ?? []) items.push(await normalizeContent(env.DB, r));
    return json({
      platform: PLATFORM,
      items,
      total: raw.total ?? items.length,
      page: raw.page ?? 1,
      limit: raw.limit ?? items.length,
      pages: raw.pages ?? 1
    });
  }, "/internal/av/content"),
  "/internal/av/search": /* @__PURE__ */ __name(async (_req, env, url) => {
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return fail(400, "INVALID_ARGUMENT", 'Thieu tham so "q"');
    const limit = url.searchParams.get("limit") || "20";
    const sp = new URLSearchParams({ q, page: "1", limit });
    const raw = await callUpstream(
      `${UPSTREAM.content}/api/content?${sp}`
    );
    const items = [];
    for (const r of raw.items ?? []) items.push(await normalizeContent(env.DB, r));
    return json({ platform: PLATFORM, query: q, items, total: raw.total ?? items.length });
  }, "/internal/av/search"),
  /** Xac thuc developer lay token cua ANIVIET (dung chung he thong user). */
  "/internal/av/verify-user": /* @__PURE__ */ __name(async (req, _env) => {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail(400, "CLIENT_KEY_REQUIRED", "Thieu Bearer token");
    try {
      const user = await callUpstream(
        `${UPSTREAM.auth}/api/auth/me`,
        1e4,
        { Authorization: `Bearer ${token}` }
      );
      return json({ ok: true, user: user.user ?? null });
    } catch {
      return fail(401, "INVALID_CLIENT_KEY", "Token khong hop le");
    }
  }, "/internal/av/verify-user")
};
var schemaReady = false;
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (env.DB && !schemaReady) {
      try {
        await ensureIdSchema(env.DB);
        await loadMaxIds(env.DB);
        schemaReady = true;
      } catch (e) {
        console.error("id_map setup failed", e);
      }
    }
    const handler = routes[path];
    if (!handler) {
      return fail(404, "NOT_FOUND", `Khong co route ${path}`);
    }
    try {
      return await handler(request, env, url);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("av-api error", path, message);
      const upstreamDown = /upstream HTTP|fetch failed|aborted/i.test(message);
      return fail(
        upstreamDown ? 502 : 500,
        upstreamDown ? "UPSTREAM_ERROR" : "INTERNAL_ERROR",
        message
      );
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
