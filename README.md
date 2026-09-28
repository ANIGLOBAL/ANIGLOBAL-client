# ANIGLOBAL-client

Developer portal for ANIGLOBAL — the free API. One public API, one query language.

> The parent brand site lives in the separate `ANIGLOBAL` repository. This repository
> holds the developer-facing half: the AGQL implementation, the region adapter worker
> and the developer console.

> **Status: v1, under construction.** Only the `ASIA` region has real data, and
> within it only Vietnamese right now. See [Not built yet](#not-built-yet) so
> you do not expect features that are missing.

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
Region Router
   └── ASIA   (AniViet — Vietnamese)  ← only enabled region in v1
   │             selected language via @locale ("vi-VN" | "en")
   ▼
asia-api  (aggregator worker)
   │
   ▼
AniViet workers (content, auth, shop, watchparty, …)
```

The public API never exposes AniList, MAL or MangaDex. They are implementation
details behind the region adapter.

---

## Regions and locales

**Region** is the top level. Languages live *inside* a region, chosen with
`@locale` — so "Vietnamese" and "English" are not separate platforms.

```aniglobalql
AGQL -> ASIA @locale("vi-VN") { anime(search: "Frieren") { id title } }
AGQL -> ASIA @locale("en")     { anime(search: "Frieren") { id title } }
AGQL { anime { id } }   -- no region, defaults to ASIA in v1
```

Only `ASIA` is enabled. Other regions are interfaces only — no fake data.

---

## AGQL

AGQL is **not** GraphQL. It is ANIGLOBAL's own syntax.

```aniglobalql
AGQL -> ASIA @locale("vi-VN") {
  anime(search: "Frieren") @smart {
    id
    title
    cover

    -> characters @merge { id name image }
    -> staff @fallback { id name role }
  }
}
```

- `AGQL { … }` — no region given, defaults to `ASIA` in v1
- `AGQL -> ASIA { … }` — explicit region routing
- `->` — relation traversal
- Directives: `@smart`, `@merge`, `@fallback`, `@locale`

Implemented: lexer, parser, AST — 14 tests.
Not yet: validator, executor, directives.

---

## Canonical IDs

Public data uses ANIGLOBAL's own IDs. Source IDs (slugs, AniList IDs) stay
internal.

```text
ag_anime_1
ag_manga_1
ag_character_1
ag_staff_1
```

`asia-api` keeps the mapping in its own D1 database (`aniglobal-asia`,
`id_map` table). IDs are sequential, never reused, and stable per source ID.
Without a D1 binding the worker still runs but IDs come from a hash and change
on every deploy — `/health` reports this as `idMappingPersistent: false`.

---

## Repository layout

```text
src/
├── agql/           lexer, parser, ast, validator*, executor*  (* todo)
├── api/            routes, auth, developer, errors
├── platforms/      region providers (av → asia, others reserved)
├── core/           models, region, ids
├── clients/        registration, authentication, permissions, rate-limit
├── cache/
└── utils/

workers/
└── asia-api/       asia-api.js = the deploy file (plain JS, no build step)

test/
```

---

## Development

```bash
npm install
npm run typecheck   # src + workers (strict), then tests
npm test            # 33 tests
```

There is **no build step and no wrangler**. `workers/asia-api/asia-api.js` is
plain JavaScript with no imports, so it can be pasted into the Dashboard as-is,
and the tests import that exact same file.

---

## Deploy asia-api

Deployed **manually** — the repo does not use wrangler.

1. Dashboard → Workers & Pages → `asia-api` → Edit code
2. Paste the whole of `workers/asia-api/asia-api.js`
3. Deploy
4. Settings → Bindings:

| Binding | Type | Resource |
|---|---|---|
| `DB` | D1 Database | `aniglobal-av`… → `aniglobal-asia` — `4b84f285-03fc-4af2-a937-f035fff24a38` |

5. No environment variables needed.

Details in `workers/asia-api/BINDINGS.md`.

Verify:

```
GET https://asia-api.aniviet.workers.dev/health
```

`d1: true` and `idMappingPersistent: true` are required — if `d1` is `false`,
canonical IDs are temporary and will change on every deploy.

---

## Build order

Later phases depend on earlier ones.

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 1 | Data model, canonical IDs, App Client model | 🟡 data model + IDs xong |
| 2 | AGQL lexer, parser, AST, validator, executor | 🟡 lexer/parser/AST xong |
| 3 | App registration | ⬜ |
| 4 | Authentication, scopes, rate limit | ⬜ |
| 5 | ASIA provider | ⬜ |
| 6 | `@smart` `@merge` `@fallback` `@locale` | ⬜ |
| 7 | `POST /v1/agql` | ⬜ |
| 8 | Developer Console (`/ANIVIET` in Vietnamese) | ⬜ |
| 9 | Documentation (`/docs` in English) | ⬜ |

---

## Not built yet

Ghi rõ để không ai tưởng đã có:

- `POST /v1/agql` chưa tồn tại
- Developer Console chưa có: no create app, no key display, no rotate/revoke
- `/docs` chưa có
- `character`, `staff`, `studio`, `producer` chưa nối vào `asia-api`
- Dữ liệu ASIA còn mỏng: ~226 anime SFW + 29 NSFW + 1.664 nhân vật + 334 staff.
  Phần lớn anime/manga chỉ có title/cover/status; `description` chỉ có 65 mục,
  `genres` rất ít, `external_ids` rỗng nên chưa tra được AniList ID
- Developer accounts reuse AniViet auth — one login covers both. No separate
  AniGlobal user system exists (there is nothing else to authenticate against yet)

---

## License

Proprietary / source-available. Chưa chốt văn bản license — đây là quyết định của
chủ sở hữu repo, không tự động dùng MIT/GPL/AGPL.
