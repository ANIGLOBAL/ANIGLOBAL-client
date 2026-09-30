// ============================================================
// ANIGLOBAL — aniglobal-appm
// ============================================================
// Worker QUAN LY APP CLIENT.
//
// Day la FILE DEPLOY. Khong can build, khong can bundler:
//   Cloudflare Dashboard > Worker "aniglobal-appm" > Edit code > Paste > Deploy
//   Settings > Bindings > DB -> aniglobal-globaldb
//   Settings > Variables > AUTH_API (tuy chon)
//
// ---------------------------------------
// VAI TRO TRONG HE
// ---------------------------------------
// `aniglobal-appm` la CONG TRUNG GIAN. No goc phan phoi de cac worker
// khac goi den khi can chung moc chung:
//
//   - QUAN LY APP CLIENT: sinh client ID + client key, thu hoi key
//   - CONG TRUNG GIAN: cac worker khac goi den day de lay moc chung
//
// Cac worker khu vuc (`asia-api`, `eng-api`, ...) se lam trung gian
// theo cung khuon: no la noi de worker nen la goi den, de moi thu
// co mot dia chi de quan tri, thay vi nhieu worker goi nhau truc tiep
// lan nhau.
//
// Hien tai ANIVIET van dung cac worker roi rac cua no. Do la thu
// dang chuyen dan, khong phai thiet ke cuoi cung.
//
// ---------------------------------------
// HAN DONG DAN PHAI THEO
// ---------------------------------------
// 1. Client key tra ve DUNG MOT LAN, khong luu ban ro. Xem lai thi
//    thu hoi roi tao app moi.
// 2. App client KHONG phai tai khoan. Khong duoc dung clientKey de
//    tao app khac hay xem app cua nguoi khac.
// 3. Khong tin gi browser gui. Token tai khoan phai do worker ANIVIET
//    xac nhan truoc.
// ============================================================

// ============================================================
// CONFIG
// ============================================================

/**
 * Worker xac thuc tai khoan cua ANIVIET. Mac dinh giong ANIVIET; gan
 * bien `AUTH_API` de tro sang moi truong ma khong sua code.
 */
const AUTH_API = 'https://sginup-loginsystem.aniviet.workers.dev';

/**
 * Bao lau ket qua xac thuc, giay.
 *
 * HUU HAI: dang xuat o ANIVIET co hieu luc toi da lau nhat so giay nay.
 * Do la do doi doi chieu. Dat `AUTH_TTL_SECONDS = 0` neu can hieu luc
 * ngay lap tuc.
 */
const AUTH_TTL_SECONDS = 60;

/** Gioi han tao app: 20 lan / nguoi / gio. Chan spam san app rac. */
const CREATE_LIMIT = { max: 20, windowMs: 3600_000 };

/** So app toi da ma mot tai khoan duoc giu. */
const MAX_APPS_PER_USER = 50;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-ANIGLOBAL-Client-ID',
  'Access-Control-Max-Age': '600',
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/**
 * Loi dang `{ error: { code, message } }`. Ma ghi trong tai lieu nen
 * phai dung ma co dinh.
 */
function fail(status, code, message) {
  return json({ error: { code, message } }, status);
}

// ============================================================
// TIEN ICH
// ============================================================

const nowIso = () => new Date().toISOString();

function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Chu de danh, khong chua ky tu la. */
const B32 = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * Sinh chuoi ngau nhien bao hoa.
 *
 * `crypto.getRandomValues` la nguon duy nhat dung duoc. `Math.random()`
 * khong duoc dung cho secret: no bao hoa qua yeu va bi doan khi biet
 * trang thai truoc do.
 */
function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += B32[b % 32];
  return out;
}

const newClientId = () => 'agc_' + randomId(24);
const newClientKey = () => 'agk_' + randomId(40);

// ============================================================
// DANH SACH SITE — phai khop voi frontend
// ============================================================

/**
 * Site nao duoc phep tao app, va no thuoc region nao.
 *
 * Phai khop voi `src/data/regions.ts` cua trang web. Neu trang web hien
 * mot site ma worker nay tu choi, nguoi dung tao app xong moi bi chiem.
 *
 * `region` la vung dia ly (ASIA), `site` la site quoc gia trong vung do
 * (ANIVIET). Hai thu khac nhau: mot vung co nhieu site quoc gia.
 */
const SITES = {
  ANIVIET: { region: 'ASIA', locale: 'vi-VN', name: 'ANIVIET' },
};

const SCOPES = new Set(['read', 'read:images']);

// ============================================================
// XAC THUC TAI KHOAN
// ============================================================

/** token -> { user, until }. Chi song trong mot isolate cua worker. */
const authCache = new Map();

/**
 * Xac thuc token ANIVIET.
 *
 * KHONG TIN TOKEN GUI LEN TU BROWSER. Token do client gui, client la
 * bat ky ai. Token phai duoc worker ANIVIET xac nhan truoc, roi worker
 * nay moi dung `user.id` tra ve do la chu so chon app cua nguoi do.
 */
async function requireUser(request, env) {
  const token = bearer(request);
  if (!token) {
    return { error: fail(401, 'CLIENT_ID_REQUIRED', 'Thieu token dang nhap.') };
  }

  const authApi = (env && env.AUTH_API ? env.AUTH_API : AUTH_API).replace(/\/+$/, '');

  if (authApi === AUTH_API && AUTH_TTL_SECONDS > 0) {
    const hit = authCache.get(token);
    if (hit && hit.until > Date.now()) return { user: hit.user };
  }

  let user = null;
  try {
    const res = await fetch(authApi + '/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (res.ok) {
      const body = await res.json();
      if (body && body.user && body.user.id) user = body.user;
    }
  } catch {
    // Worker ANIVIET khong goi duoc. Xem nhu khong xac thuc duoc thay vi
    // bo qua — bo qua nghia la mo cong khi ha tang auth chua.
    return {
      error: fail(503, 'AUTH_UNAVAILABLE', 'Khong xac thuc duoc tai khoan. Thu lai sau.'),
    };
  }

  if (!user) {
    return { error: fail(401, 'INVALID_TOKEN', 'Token khong hop le hoac da het han.') };
  }

  if (authApi === AUTH_API && AUTH_TTL_SECONDS > 0) {
    authCache.set(token, { user, until: Date.now() + AUTH_TTL_SECONDS * 1000 });
  }
  return { user };
}

// ============================================================
// GIOI HAN TAO APP
// ============================================================

/** userId -> danh sach timestamp tao app. */
const createLog = new Map();

function allowCreate(userId) {
  const now = Date.now();
  const hits = (createLog.get(userId) || []).filter((t) => now - t < CREATE_LIMIT.windowMs);

  if (hits.length >= CREATE_LIMIT.max) {
    createLog.set(userId, hits);
    return {
      ok: false,
      retryAfter: Math.ceil((CREATE_LIMIT.windowMs - (now - hits[0])) / 1000),
    };
  }

  hits.push(now);
  createLog.set(userId, hits);
  return { ok: true };
}

/** Gioi han bo nho: worker chay lau voi nhieu tai khoan se phinh len. */
function pruneCaches() {
  if (authCache.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of authCache) if (v.until <= now) authCache.delete(k);

  if (createLog.size < 5000) return;
  for (const [k, hits] of createLog) {
    if (!hits.some((t) => now - t < CREATE_LIMIT.windowMs)) createLog.delete(k);
  }
}

/**
 * Xoa cache giua cac test.
 *
 * `authCache` va `createLog` phai o module scope vi Cloudflare Worker
 * chay lai trong mot isolate. Nhung chinh vi the chung song qua giua cac
 * test, nen test phai co cach xoa — khong co cach nao khac ma khong lam
 * do loi vao code chay that.
 */
export function __resetForTest() {
  authCache.clear();
  createLog.clear();
}

// ============================================================
// CHUYEN DOI HANG
// ============================================================

function toPublic(row) {
  return {
    clientId: row.client_id,
    name: row.name,
    // `region` la vung dia ly, `site` la site quoc gia. Frontend hien ca
    // hai nen mot app luon biet no thuoc vung nao.
    region: row.region,
    site: row.site,
    scope: row.scope,
    status: row.status,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || null,
    requestCount: row.request_count || 0,
  };
}

// ============================================================
// ROUTE
// ============================================================

async function handleCreateApp(request, db, user) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'INVALID_BODY', 'Body khong phai JSON hop le.');
  }

  const name = String(body.name || '').trim();
  const site = String(body.site || body.region || '').trim().toUpperCase();
  const scope = String(body.scope || 'read').trim();

  if (name.length < 2 || name.length > 64) {
    return fail(400, 'INVALID_NAME', 'Ten app phai tu 2 den 64 ky tu.');
  }

  const entry = SITES[site];
  if (!entry) {
    return fail(400, 'PLATFORM_NOT_AVAILABLE', `Site "${site}" khong ton tai.`);
  }

  // Client cung co the gui `region` len. Neu gui sai thi dung ban tra ve,
  // do worker la noi duy nac biet site thuoc region nao — dung thong tin
  // tu client se tao ra app ma khong khop voi bang tra cuu.
  const claimed = String(body.region || '').trim().toUpperCase();
  if (claimed && claimed !== entry.region) {
    return fail(
      400,
      'REGION_SITE_MISMATCH',
      `Site ${site} thuoc vung ${entry.region}, khong phai ${claimed}.`
    );
  }
  const region = entry.region;

  if (!SCOPES.has(scope)) {
    return fail(400, 'INSUFFICIENT_SCOPE', `Scope "${scope}" khong hop le.`);
  }

  const limit = allowCreate(user.id);
  if (!limit.ok) {
    return new Response(
      JSON.stringify({
        error: { code: 'RATE_LIMITED', message: 'Tao qua nhieu app trong mot gio. Thu lai sau.' },
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(limit.retryAfter),
          ...CORS,
        },
      }
    );
  }

  const count = await db
    .prepare('SELECT COUNT(*) AS n FROM apps WHERE owner_user_id = ?')
    .bind(user.id)
    .first();
  if (count && Number(count.n) >= MAX_APPS_PER_USER) {
    return fail(403, 'APP_LIMIT_REACHED', 'So app da dat toi da. Thu hoi app cu truoc.');
  }

  const clientId = newClientId();
  const clientKey = newClientKey();
  const keyHash = await sha256Hex(clientKey);

  await db
    .prepare(
      `INSERT INTO apps
         (client_id, owner_user_id, name, region, site, scope, key_hash, status, created_at, request_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 0)`
    )
    .bind(clientId, user.id, name, region, site, scope, keyHash, nowIso())
    .run();

  // `clientKey` xuat hien MOT LAN o day. Worker khong luu ban ro nen tu
  // gio khong co duong nao tra lai duoc. Xem lai phai tao app moi.
  return json(
    {
      clientId,
      clientKey,
      name,
      region,
      site,
      scope,
      status: 'active',
      createdAt: nowIso(),
      lastUsedAt: null,
      requestCount: 0,
    },
    201
  );
}

async function handleListApps(db, user, url) {
  // Loc theo vung/site neu client hoi. Truy van tren trang site luon
  // kem ca hai, nen chi thay app cua trang do moi thay.
  const region = (url.searchParams.get('region') || '').trim().toUpperCase();
  const site = (url.searchParams.get('site') || '').trim().toUpperCase();

  let sql =
    `SELECT client_id, name, region, site, scope, status, created_at, last_used_at, request_count
       FROM apps
      WHERE owner_user_id = ?`;
  const params = [user.id];

  if (region) {
    sql += ' AND region = ?';
    params.push(region);
  }
  if (site) {
    sql += ' AND site = ?';
    params.push(site);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';

  const res = await db.prepare(sql).bind(...params).all();
  return json({ apps: (res.results || []).map(toPublic) });
}

async function handleRevokeApp(db, user, clientId) {
  // WHERE owner_user_id luon di kem WHERE client_id. Khong co dieu kien
  // chu so san, nguoi khac khong the thu hoi app cua ngui nay.
  const res = await db
    .prepare(`UPDATE apps SET status = 'revoked' WHERE client_id = ? AND owner_user_id = ?`)
    .bind(clientId, user.id)
    .run();

  if (!res.meta || !res.meta.changes) {
    return fail(404, 'APP_NOT_FOUND', 'Khong tim thay app nay trong tai khoan cua ban.');
  }
  return json({ clientId, status: 'revoked' });
}

// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ---------------------------------------------------------
    // GET /v1/health — khong can xac thuc
    // ---------------------------------------------------------
    if (url.pathname === '/v1/health') {
      let dbOk = false;
      try {
        await env.DB.prepare('SELECT 1').first();
        dbOk = true;
      } catch {
        dbOk = false;
      }
      return json({
        ok: true,
        service: 'aniglobal-appm',
        sites: Object.keys(SITES).map((id) => ({
          site: id,
          region: SITES[id].region,
          locale: SITES[id].locale,
        })),
        database: dbOk,
      });
    }

    // Phan con lai deu can tai khoan ANIVIET.
    const authed = await requireUser(request, env);
    if (authed.error) return authed.error;
    const user = authed.user;

    pruneCaches();

    if (url.pathname === '/v1/apps') {
      if (request.method === 'GET') return handleListApps(env.DB, user, url);
      if (request.method === 'POST') return handleCreateApp(request, env.DB, user);
      return fail(405, 'METHOD_NOT_ALLOWED', 'Chi ho tro GET va POST.');
    }

    const revokeMatch = /^\/v1\/apps\/([A-Za-z0-9_]+)$/.exec(url.pathname);
    if (revokeMatch) {
      if (request.method !== 'DELETE') {
        return fail(405, 'METHOD_NOT_ALLOWED', 'Chi ho tro DELETE.');
      }
      return handleRevokeApp(env.DB, user, revokeMatch[1]);
    }

    return fail(404, 'NOT_FOUND', 'Khong tim thay endpoint nay.');
  },
};
