# aniglobal-appm — cai dat

Worker quan ly app client cua ANIGLOBAL, dong thoi la **cong trung gian**
cho cac worker khac goi den khi can chung moc chung.

Day la FILE DEPLOY. Khong dung `wrangler` de deploy — dung Cloudflare
Dashboard, giong cac worker khac cua project nay.

## Vai tro trong he

| Worker | Phu trach |
|---|---|
| `aniglobal-appm` | sinh client ID + client key, thu hoi key. La cong trung gian de worker khac goi den. |
| `asia-api`, `eng-api` (sau nay) | worker khu vuc, cung lam trung gian theo cung khuon. |

Worker khu vuc **khong** goi thang len nhau. Chung goi qua mot cong
trung gian de moi thu co mot dia chi de quan tri, thay vi phai nhiet
nhieu worker tro toi nhau lan nhau.

ANIVIET hien van dung cac worker roi rac cua no — do la thu dang
chuyen dan, khong phai thiet ke cuoi cung.

---

## Buoc 1 — D1 dung chung

`Cloudflare Dashboard > Workers & Pages > D1 SQL Database > Create database`

Ten: `aniglobal-globaldb`

Mot database cho ca he. `aniglobal-appm` giu bang `apps`; worker khu vuc
giu bang `id_map` cua chung. Hai bang khac nhau nen khong anh huong nhau.

## Buoc 2 — Tao bang

`Dashboard > D1 > aniglobal-globaldb > Console`, dan phan `CREATE TABLE`
tu `schema.sql` vao va chay.

> Neu da tung chay phien ban cu cua schema, cot `region` luc do luu **ten
> site** chu khong phai vung dia ly. Phan `MIGRATION` cuoi `schema.sql`
> giai thich cach chuyen doi lai.

## Buoc 3 — Worker

`Dashboard > Workers & Pages > Create > Worker`, ten: `aniglobal-appm`

Mo **Edit code**, dan toan bo `appm.js` vao, bam **Deploy**.

## Buoc 4 — Variables (tuy chon)

`Worker > Settings > Variables and Secrets`

| Bien | Gia tri |
|---|---|
| `AUTH_API` | `https://sginup-loginsystem.aniviet.workers.dev` |

Khong bat buoc — mac dinh da trong code. Dat khi tro sang moi truong.

## Buoc 5 — Binding D1

`Worker > Settings > Bindings > Add > D1 database`

| Binding | Database |
|---|---|
| `DB` | `aniglobal-globaldb` |

T `DB` rat quan trong, code goi `env.DB`.

## Kiem tra

```bash
curl https://aniglobal-appm.aniviet.workers.dev/v1/health
```

```json
{ "ok": true, "service": "aniglobal-appm",
  "sites": [{ "site": "ANIVIET", "region": "ASIA", "locale": "vi-VN" }],
  "database": true }
```

`"database": false` = binding `DB` sai. Cac endpoint khac se loi.

---

## Endpoint

### `GET /v1/health`
Khong can xac thuc.

### `GET /v1/apps`
`Authorization: Bearer <token ANIVIET>`

Bo loc tuy chon: `?region=ASIA&site=ANIVIET`

```json
{ "apps": [ { "clientId": "agc_…", "name": "…",
              "region": "ASIA", "site": "ANIVIET", "scope": "read",
              "status": "active", "createdAt": "…",
              "lastUsedAt": null, "requestCount": 0 } ] }
```

Chi tra app cua chinh tai khoan dang goi.

### `POST /v1/apps`
`Authorization: Bearer <token ANIVIET>`

```json
{ "name": "My tracker", "site": "ANIVIET", "region": "ASIA", "scope": "read" }
```

`region` tuy chon; gui sai vung se ra `REGION_SITE_MISMATCH` vi worker
suy ra region tu bang `SITES` cua no.

| Gioi han | Gia tri |
|---|---|
| Tao app / nguoi | 20 / gio (`429` + `Retry-After`) |
| So app / nguoi | 50 (`403 APP_LIMIT_REACHED`) |

Tra `201` kem `clientId` va `clientKey`. **`clientKey` chi xuat hien mot
lan.** Xem lai thi thu hoi roi tao app moi.

### `DELETE /v1/apps/:clientId`
`Authorization: Bearer <token ANIVIET>`

`WHERE` luon kem `owner_user_id` nen khong thu hoi duoc app cua nguoi
khac — tra `404`.

---

## Ma loi

| Code | Nghia |
|---|---|
| `CLIENT_ID_REQUIRED` | Thieu `Authorization: Bearer` |
| `INVALID_TOKEN` | Token khong hop le hoac het han |
| `AUTH_UNAVAILABLE` | Worker ANIVIET khong goi duoc (503) |
| `INVALID_BODY` | Body khong phai JSON |
| `INVALID_NAME` | Ten app ngoai 2–64 ky tu |
| `PLATFORM_NOT_AVAILABLE` | Site khong ton tai |
| `REGION_SITE_MISMATCH` | `region` gui len khong dung region cua site do |
| `INSUFFICIENT_SCOPE` | Scope khong hop le |
| `RATE_LIMITED` | Tao qua nhieu app trong gio |
| `APP_LIMIT_REACHED` | Da dat gioi han so app |
| `APP_NOT_FOUND` | App khong thuoc tai khoan nay |
| `METHOD_NOT_ALLOWED` | Sai HTTP method |
| `NOT_FOUND` | Sai duong dan |

Cac ma nay da ghi trong tai lieu cua trang web. Doi ma la doi contract.

---

## Luu y khi sua code

**`SITES` phai khop voi `src/data/regions.ts` cua trang web.** Neu trang
web hien ra mot site ma worker nay khong biet, nguoi dung tao app xong
moi bi chiem. Khi them site moi, sua ca hai noi.

**Khong luu client key ban ro.** Chi luu `key_hash` (SHA-256). Muon xem lai
thi thu hoi roi tao app moi.

**Khong tin gi browser gui.** `user_id` do browser gui khong co gia tri gi.
Worker goi `/api/auth/me` cua ANIVIET roi dung `user.id` tra ve lam ranh
gioi so huu. Xem `requireUser`.

**`AUTH_TTL_SECONDS` la do doi doi chieu.** Cache 60 giay nghia la dang
xuat o ANIVIET co hieu luc toi da lau nhat 60 giay. Dat `0` neu can ngay.
