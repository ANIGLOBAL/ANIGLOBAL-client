# ANIGLOBAL API

Free API for developers. One public API, one query language.

> **Status: v1, under construction.** Only the `AV` (Vietnamese) platform has
> real data. `AE` and `AC` exist as interfaces only — see
> [Not built yet](#not-built-yet) so you do not expect features that are missing.

---

## What this is

ANIGLOBAL is the global data/API layer. Developers register an **App Client**,
then query data with **ANIGLOBALQL (AGQL)**.

```text
Developer
   │  register app
   ▼
ANIGLOBAL Developer Console          (Phase 8)
   │  client-id + client-key
   ▼
App Client
   │  authenticated AGQL request
   ▼
ANIGLOBAL API                        (Phase 7)
   │  POST /v1/agql
   ▼
AGQL parser → validator → executor
   │
   ▼
Platform Router
   ├── AV   ANIVIET (Vietnamese)   ← only enabled platform in v1
   ├── AE   ANIENG (English)       reserved
   └── AC   Chinese                reserved
   │
   ▼
av-api  (aggregator worker)
   │
   ▼
ANIVIET workers (content, auth, shop, watchparty, …)
```

The public API never exposes AniList, MAL or MangaDex. They are implementation
details behind the AV adapter.

---

## AGQL

AGQL is **not** GraphQL. It is ANIGLOBAL's own syntax.

```aniglobalql
AGQL -> AV @locale("vi-VN") {
  anime(search: "Frieren") @smart {
    id
    title
    cover

    -> characters @merge { id name image }
    -> staff @fallback { id name role }
  }
}
```

- `AGQL { … }` — no platform given, defaults to `AV` in v1
- `AGQL -> AV { … }` — explicit platform routing
- `->` — relation traversal
- Directives: `@smart`, `@merge`, `@fallback`, `@locale`

Syntax implemented today: lexer, parser, AST — **15 tests**.
Not implemented yet: validator, executor, directives.

---

## Canonical IDs

Public data uses ANIGLOBAL's own IDs. Source IDs (slugs, AniList IDs) stay internal.

```text
ag_anime_1
ag_manga_1
ag_character_1
ag_staff_1
```

`av-api` maintains the mapping in its own D1 database (`id_map` table). IDs are
sequential, never reused, and stable for a given source ID.

---

## Repository layout

```text
src/
├── agql/           lexer, parser, ast, validator*, executor*  (* todo)
├── api/            routes, auth, developer, errors
├── platforms/      av, ae, ac  (PlatformProvider)
├── core/           models, ids
├── clients/        registration, authentication, permissions, rate-limit
├── cache/
└── utils/

workers/
└── av-api/         aggregator worker: AV data -> ANIGLOBAL canonical model

tools/
└── build-av-api.mjs   bundle thành 1 file để deploy Dashboard

test/
```

---

## Development

```bash
npm install

npm run typecheck        # src + workers (strict) rồi cả test
npm test                 # 34 tests
node tools/build-av-api.mjs
```

`npm run typecheck:src` chỉ kiểm tra mã nguồn, không kiểm tra test.

---

## Deploy av-api

1. Tạo D1 database `aniglobal-av`, copy `database_id` vào `workers/av-api/wrangler.toml`
2. `node tools/build-av-api.mjs` → sinh `workers/av-api/av-api.js`
3. Cloudflare Dashboard → Worker `av-api` → Edit code → paste file → Deploy
4. Gán binding `DB` trỏ tới `aniglobal-av`

Kiểm tra: `GET /health` phải trả `service: "av-api"`, `platform: "AV"`.

---

## Build order

The order matters — later phases depend on earlier ones.

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 1 | Data model, canonical IDs, App Client model | 🟡 data model + IDs xong |
| 2 | AGQL lexer, parser, AST, validator, executor | 🟡 lexer/parser/AST xong |
| 3 | App registration | ⬜ |
| 4 | Authentication, scopes, rate limit | ⬜ |
| 5 | AV provider | ⬜ |
| 6 | `@smart` `@merge` `@fallback` `@locale` | ⬜ |
| 7 | `POST /v1/agql` | ⬜ |
| 8 | Developer Console | ⬜ |
| 9 | Documentation | ⬜ |

---

## Not built yet

Ghi rõ để không ai tưởng đã có:

- `POST /v1/agql` chưa tồn tại
- Developer Console chưa có (trang tạo app, xem key, rotate, revoke)
- Trang `/docs` chưa có
- `character`, `staff`, `studio`, `producer` chưa nối vào `av-api`
- Dữ liệu AV còn mỏng: khoảng 226 anime + 29 NSFW + 1.664 nhân vật + 334 staff.
  Phần lớn chỉ có title/cover/status; description chỉ có 65 mục, genres rất ít

---

## License

Proprietary / source-available. Chưa chốt văn bản license — đây là quyết định của
chủ sở hữu repo, không tự động dùng MIT/GPL/AGPL.
