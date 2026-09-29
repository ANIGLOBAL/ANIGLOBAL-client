import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import worker, { __resetForTest } from '../workers/aniglobal-api/aniglobal-api.js'

const REAL_FETCH = globalThis.fetch
const AUTH_BASE = 'https://sginup-loginsystem.aniviet.workers.dev'

/** Token nao -> user nao. Token `null` se bi worker auth tu choi. */
const TOKENS: Record<string, { id: number; email: string; username: string }> = {
  'token-alice': { id: 1, email: 'alice@example.com', username: 'alice' },
  'token-bob': { id: 2, email: 'bob@example.com', username: 'bob' },
}

/** D1 gia lap: bang `apps` trong bo nho. */
function makeD1() {
  const apps = new Map<string, Record<string, unknown>>()

  return {
    apps,
    prepare(sql: string) {
      // `SELECT 1` khong co tham so binding, nen `first()` phai nam ngay
      // tren ket qua cua `prepare`, khong phai tren ket qua cua `bind`.
      const noBind = {
        first: async () => ({ '1': 1 }),
        run: async () => ({ success: true, meta: { changes: 0 } }),
        all: async () => ({ results: [] }),
      }

      return {
        first: noBind.first,
        all: noBind.all,
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (/COUNT\(\*\)/.test(sql)) {
              const n = [...apps.values()].filter(
                (r) => Number(r.owner_user_id) === Number(args[0])
              ).length
              return { n }
            }
            if (/key_hash = \?/.test(sql)) {
              return [...apps.values()].find((r) => r.key_hash === args[0]) ?? null
            }
            return null
          },
          run: async () => {
            if (/INSERT INTO apps/.test(sql)) {
              const row = {
                client_id: String(args[0]),
                owner_user_id: Number(args[1]),
                name: String(args[2]),
                region: String(args[3]),
                scope: String(args[4]),
                key_hash: String(args[5]),
                status: 'active',
                created_at: String(args[6]),
                last_used_at: null,
                request_count: 0,
              }
              apps.set(row.client_id, row)
              return { success: true, meta: { changes: 1 } }
            }
            if (/UPDATE apps SET status/.test(sql)) {
              const row = apps.get(String(args[0]))
              // Kiem tra owner: worker luon kem `AND owner_user_id = ?`.
              if (!row || Number(row.owner_user_id) !== Number(args[1])) {
                return { success: true, meta: { changes: 0 } }
              }
              row.status = 'revoked'
              return { success: true, meta: { changes: 1 } }
            }
            return { success: true, meta: { changes: 1 } }
          },
          all: async () => {
            if (/FROM apps/.test(sql)) {
              const list = [...apps.values()]
                .filter((r) => Number(r.owner_user_id) === Number(args[0]))
                .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
              return { results: list }
            }
            return { results: [] }
          },
        }),
      }
    },
  }
}

/**
 * Thay `fetch` de kiem tra `/api/auth/me` cho user theo token.
 *
 * Worker goi `fetch(url, { headers })`, nen `input` la chuoi chu khong
 * phai `Request` — phai doc header tu tham so `init`.
 */
function mockAuth() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith(AUTH_BASE + '/api/auth/me')) {
      const h = (init?.headers ?? {}) as Record<string, string>
      const token = String(h.Authorization ?? '').replace('Bearer ', '')
      const user = TOKENS[token]
      if (!user) return new Response('nope', { status: 401 })
      return new Response(JSON.stringify({ user }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw new Error('fetch khong mong doi: ' + url)
  }
}

function env(db: ReturnType<typeof makeD1>) {
  return { DB: db, AUTH_API: AUTH_BASE }
}

/** `res.json()` tra `unknown` trong TS moi. Helper nay rut gon cho test. */
async function j(res: Response): Promise<any> {
  return (await res.json()) as any
}

function req(
  path: string,
  init: RequestInit & { token?: string | null } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  }
  if (init.token) headers.Authorization = 'Bearer ' + init.token
  return new Request('https://aniglobal-api.test' + path, { ...init, headers })
}

// Cache xac thuc va gioi han tao app song o module scope cua worker
// (Cloudflare Worker chay lai trong mot isolate). Neu khong xoa giua
// cac test, mot test se an het han cua test sau.
beforeEach(() => {
  __resetForTest()
  mockAuth()
})
afterEach(() => {
  globalThis.fetch = REAL_FETCH
})

// ------------------------------------------------------------
test('GET /v1/health khong can dang nhap va bao cao D1', async () => {
  const db = makeD1()
  const res = await worker.fetch(req('/v1/health'), env(db))
  assert.equal(res.status, 200)

  const body = await j(res)
  assert.equal(body.ok, true)
  assert.equal(body.database, true)
  assert.ok(body.regions.some((r: { region: string }) => r.region === 'ASIA'))
})

test('OPTIONS tra 204 cho preflight', async () => {
  const res = await worker.fetch(req('/v1/apps', { method: 'OPTIONS' }), env(makeD1()))
  assert.equal(res.status, 204)
})

test('GET /v1/apps khong co token bi tu choi', async () => {
  const res = await worker.fetch(req('/v1/apps'), env(makeD1()))
  assert.equal(res.status, 401)
  assert.equal((await j(res)).error.code, 'CLIENT_ID_REQUIRED')
})

test('GET /v1/apps voi token khong ton tai bi tu choi', async () => {
  const res = await worker.fetch(req('/v1/apps', { token: 'token-khong-co' }), env(makeD1()))
  assert.equal(res.status, 401)
  assert.equal((await j(res)).error.code, 'INVALID_TOKEN')
})

test('POST /v1/apps tra clientId va clientKey', async () => {
  const db = makeD1()
  const res = await worker.fetch(
    req('/v1/apps', {
      method: 'POST',
      token: 'token-alice',
      body: JSON.stringify({ name: 'App cua Alice', region: 'ANIVIET', scope: 'read' }),
    }),
    env(db)
  )

  assert.equal(res.status, 201)
  const app = await j(res)
  assert.match(app.clientId, /^agc_/)
  assert.match(app.clientKey, /^agk_/)
  assert.equal(app.region, 'ANIVIET')
  assert.equal(app.status, 'active')
  assert.equal(app.requestCount, 0)
})

test('clientKey khong bao gio duoc luu ban ro', async () => {
  const db = makeD1()
  const res = await worker.fetch(
    req('/v1/apps', {
      method: 'POST',
      token: 'token-alice',
      body: JSON.stringify({ name: 'App', region: 'ANIVIET' }),
    }),
    env(db)
  )
  const { clientKey } = await j(res)

  // D1 chi luu hash, khong co ban ro o bat dau.
  const row = [...db.apps.values()][0] as Record<string, unknown>
  assert.equal(String(row.key_hash).length, 64)
  assert.notEqual(row.key_hash, clientKey)
  assert.equal(JSON.stringify(row).includes(clientKey), false)
})

test('GET /v1/apps chi tra app cua chinh minh', async () => {
  const db = makeD1()
  const body = (name: string) =>
    JSON.stringify({ name, region: 'ANIVIET', scope: 'read' })

  await worker.fetch(
    req('/v1/apps', { method: 'POST', token: 'token-alice', body: body('App cua Alice') }),
    env(db)
  )
  await worker.fetch(
    req('/v1/apps', { method: 'POST', token: 'token-bob', body: body('App cua Bob') }),
    env(db)
  )

  const res = await worker.fetch(req('/v1/apps', { token: 'token-alice' }), env(db))
  const { apps } = await j(res)
  assert.equal(apps.length, 1)
  assert.equal(apps[0].name, 'App cua Alice')
  // Hang tra ra dung hinh dang frontend mong doi.
  assert.deepEqual(Object.keys(apps[0]).sort(), [
    'clientId',
    'createdAt',
    'lastUsedAt',
    'name',
    'region',
    'requestCount',
    'scope',
    'status',
  ])
})

test('khong thu hoi duoc app cua nguoi khac', async () => {
  const db = makeD1()
  const created = await j(
    await worker.fetch(
      req('/v1/apps', {
        method: 'POST',
        token: 'token-alice',
        body: JSON.stringify({ name: 'App cua Alice', region: 'ANIVIET' }),
      }),
      env(db)
    )
  )

  // Bob thu thu hoi app cua Alice.
  const res = await worker.fetch(
    req(`/v1/apps/${created.clientId}`, { method: 'DELETE', token: 'token-bob' }),
    env(db)
  )
  assert.equal(res.status, 404)
  assert.equal((await j(res)).error.code, 'APP_NOT_FOUND')

  // App cua Alice phai con nguyen.
  assert.equal([...db.apps.values()][0].status, 'active')
})

test('chu thanh cong app cua chinh minh', async () => {
  const db = makeD1()
  const created = await j(
    await worker.fetch(
      req('/v1/apps', {
        method: 'POST',
        token: 'token-alice',
        body: JSON.stringify({ name: 'App', region: 'ANIVIET' }),
      }),
      env(db)
    )
  )

  const res = await worker.fetch(
    req(`/v1/apps/${created.clientId}`, { method: 'DELETE', token: 'token-alice' }),
    env(db)
  )
  assert.equal(res.status, 200)
  assert.equal((await j(res)).status, 'revoked')
  assert.equal([...db.apps.values()][0].status, 'revoked')
})

test('tu choi site khong ton tai', async () => {
  const res = await worker.fetch(
    req('/v1/apps', {
      method: 'POST',
      token: 'token-alice',
      body: JSON.stringify({ name: 'App', region: 'KHONG_CO' }),
    }),
    env(makeD1())
  )
  assert.equal(res.status, 400)
  assert.equal((await j(res)).error.code, 'PLATFORM_NOT_AVAILABLE')
})

test('tu choi scope khong hop le', async () => {
  const res = await worker.fetch(
    req('/v1/apps', {
      method: 'POST',
      token: 'token-alice',
      body: JSON.stringify({ name: 'App', region: 'ANIVIET', scope: 'admin' }),
    }),
    env(makeD1())
  )
  assert.equal(res.status, 400)
  assert.equal((await j(res)).error.code, 'INSUFFICIENT_SCOPE')
})

test('tu choi ten qua ngan', async () => {
  const res = await worker.fetch(
    req('/v1/apps', {
      method: 'POST',
      token: 'token-alice',
      body: JSON.stringify({ name: 'a', region: 'ANIVIET' }),
    }),
    env(makeD1())
  )
  assert.equal(res.status, 400)
  assert.equal((await j(res)).error.code, 'INVALID_NAME')
})

test('chặn tao app qua nhieu lan trong mot gio', async () => {
  const db = makeD1()
  let limited = 0

  for (let i = 0; i < 25; i++) {
    const res = await worker.fetch(
      req('/v1/apps', {
        method: 'POST',
        token: 'token-alice',
        body: JSON.stringify({ name: 'App ' + i, region: 'ANIVIET' }),
      }),
      env(db)
    )
    if (res.status === 429) {
      limited++
      assert.ok(res.headers.get('Retry-After'))
      assert.equal((await j(res)).error.code, 'RATE_LIMITED')
    }
  }

  assert.equal(limited, 5) // 25 - 20 cho phep
})

test('/v1/agql nam o worker region, khong phai worker nay', async () => {
  const res = await worker.fetch(
    req('/v1/agql', { method: 'POST', token: 'token-alice', body: '{}' }),
    env(makeD1())
  )
  assert.equal(res.status, 404)
  assert.equal((await j(res)).error.code, 'NOT_FOUND')
})

test('duong dan la bi tra 404 sau khi da xac thuc', async () => {
  // Auth chay TRUOC routing, nen duong dan la can token moi toi duoc
  // buoc 404. Khong co token se ra 401 — dung thu, khong phai loi.
  const res = await worker.fetch(
    req('/v1/khong-co', { token: 'token-alice' }),
    env(makeD1())
  )
  assert.equal(res.status, 404)
  assert.equal((await j(res)).error.code, 'NOT_FOUND')
})

test('method sai bi tra 405', async () => {
  const res = await worker.fetch(
    req('/v1/apps', { method: 'PUT', token: 'token-alice', body: '{}' }),
    env(makeD1())
  )
  assert.equal(res.status, 405)
  assert.equal((await j(res)).error.code, 'METHOD_NOT_ALLOWED')
})
