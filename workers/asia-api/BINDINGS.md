# asia-api — Cloudflare bindings
#
# Worker nay deploy THU CONG qua Dashboard, khong dung wrangler.
# File nay chi de GHI LAI binding, khong phai cau hinh deploy.
#
# Cach deploy:
#   1. Cloudflare Dashboard > Workers & Pages > asia-api > Edit code
#   2. Paste toan bo noi dung workers/asia-api/asia-api.js
#   3. Deploy
#   4. Settings > Bindings > gan binding duoi day
#   5. Settings > Variables > (khong can them bien nao)

## Binding

| Binding | Loai | Tai nguyen |
|---|---|---|
| `DB` | D1 Database | `aniglobal-globalDB` — cung database voi worker `aniglobal-api` |

> Database dung chung cho toan he. `aniglobal-api` giu bang `apps`,
> `asia-api` giu bang `id_map`. Hai bang khac nhau nen khong anh huong
> nhau, va khong can tach D1 rieng cho tung worker.

## Bang duoc worker tu tao

```sql
CREATE TABLE IF NOT EXISTS id_map (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  canonical_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_id_map_kind ON id_map (kind, canonical_id);
```

Bang nay luu mapping `du lieu goc -> canonical ID` cua ANIGLOBAL
(`ag_anime_1`, `ag_character_1`, ...). Worker tu tao bang nay luc chay,
nen khong can chay SQL thu cong.

## Kiem tra sau khi deploy

```
GET https://asia-api.aniviet.workers.dev/health
```

Phai tra:
```json
{
  "service": "asia-api",
  "region": "ASIA",
  "ok": true,
  "d1": true,
  "idMappingPersistent": true,
  "upstream": { "content": 404, "auth": 200, "watchparty": 200, "shop": 404 }
}
```

`d1: true` la bat buoc — neu `false` thi canonical ID chi sinh tam thoi va se
doi sau moi lan deploy.
