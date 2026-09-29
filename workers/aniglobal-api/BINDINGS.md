# aniglobal-api — cai dat

Worker chinh cua API cong khai ANIGLOBAL. No **quan ly vong doi app client**:
tao app, cap key, xem danh sach, thu hoi key. Worker nay khong tra du lieu
noi dung — tra du lieu la cong viec cua worker tung region (`asia-api`).

## Vai tro cua tung worker

| Worker | Phu trach |
|---|---|
| `aniglobal-api` | xac thuc tai khoan ANIVIET, tao app, cap `clientId` + `clientKey`, thu hoi key |
| `asia-api` | chay truy van AGQL, tra du lieu cua region ASIA (ANIVIET, ...) |

Mot khu vuc co **mot** worker du lieu, khong phai moi quoc gia mot worker. Them
mot site vao ASIA la doi du lieu, khong phai them dich vu.

---

## Buoc 1 — Tao D1

`Cloudflare Dashboard > Workers & Pages > D1 SQL Database > Create database`

Ten: `aniglobal-apps`

## Buoc 2 — Tao bang

`Dashboard > D1 > aniglobal-apps > Console`, dan `schema.sql` vao va chay.

Hoac dong `schema.sql` vao thu muc nay vao CLI:

```bash
npx wrangler d1 execute aniglobal-apps --file=schema.sql
```

## Buoc 3 — Tao worker

`Dashboard > Workers & Pages > Create > Worker`, ten: `aniglobal-api`

Mo trang **Edit code**, xoa phan mau, dan toan bo `aniglobal-api.js` vao, bam
**Deploy**.

> Khong dung `wrangler` de deploy. Cloudflare Dashboard la cach chuan cua
> project nay.

## Buoc 4 — Ghep bien

`Worker "aniglobal-api" > Settings > Variables and Secrets`

| Bien | Gia tri | Secret? |
|---|---|---|
| `AUTH_API` | `https://sginup-loginsystem.aniviet.workers.dev` | khong |

Khong bat buoc — `AUTH_API` da co san trong code. Dat khi can tro sang moi
truong ma khong sua code.

## Buoc 5 — Bind D1

`Worker "aniglobal-api" > Settings > Bindings > Add > D1 database`

| Binding | Database |
|---|---|
| `DB` | `aniglobal-apps` |

T ten `DB` rat quan trong. Code goi `env.DB`.

---

## Kiem tra

```bash
curl https://aniglobal-api.aniviet.workers.dev/v1/health
```

Tra ve:

```json
{
  "ok": true,
  "regions": [{ "region": "ASIA", "available": true }, "..."],
  "database": true
}
```

`"database": false` nghia la binding `DB` chua dung. Cac endpoint khac se
loi `DB is not defined` — xoa cache trong thanh dia chi va thu lai.

---

## Endpoint

### `GET /v1/health`
Khong can xac thuc. Cho frontend va nguoi dung biet region nao co du lieu.

### `GET /v1/apps`
`Authorization: Bearer <token ANIVIET>`

```json
{ "apps": [ { "clientId": "agc_…", "name": "…", "region": "ANIVIET", "scope": "read",
              "status": "active", "createdAt": "…", "lastUsedAt": null, "requestCount": 0 } ] }
```

Chi tra app cua chinh tai khoan dang goi.

### `POST /v1/apps`
`Authorization: Bearer <token ANIVIET>`

```json
{ "name": "My tracker", "region": "ANIVIET", "scope": "read" }
```

Tra `201` kem `clientId` va `clientKey`. **`clientKey` chi xuat hien mot lan.**
Khong co duong nao doc lai duoc — xem lai thi thu hoi roi tao app moi.

| Gioi han | Gia tri |
|---|---|
| Tao app / nguoi | 20 / gio (`429` kem `Retry-After`) |
| So app / nguoi | 50 (`403 APP_LIMIT_REACHED`) |

### `DELETE /v1/apps/:clientId`
`Authorization: Bearer <token ANIVIET>`

Thiet lap `status = 'revoked'`, xoa dong. `WHERE` luon kem `owner_user_id`
nen khong thu hoi duoc app cua nguoi khac — tra `404`.

### `POST /v1/agql`
Khong phuc vu o day. Worker nay tra `404 NOT_FOUND` kem loi nao la. Hay goi
`/v1/agql` tren worker cua region.

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
| `INSUFFICIENT_SCOPE` | Scope khong hop le |
| `RATE_LIMITED` | Tao qua nhieu app trong gio |
| `APP_LIMIT_REACHED` | Da dat gioi han so app |
| `APP_NOT_FOUND` | App khong thuoc tai khoan nay |
| `METHOD_NOT_ALLOWED` | Sai HTTP method |
| `NOT_FOUND` | Sai duong dan |

Cac ma nay da ghi trong tai lieu `docs.html` cua trang web. Doi ma o day la
doi contract, khong phai doi thong bao.

---

## Luu y khi sua code

**`SITES` phai khop voi `src/data/regions.ts` cua trang web.** Neu trang web
hien ra mot site ma worker nay khong biet, nguoi dung tao app xong moi bi
chiem. Khi them site moi, sua ca hai noi.

**Khong luu client key ban ro.** Chi luu `key_hash` (SHA-256). Muon xem lai
thi thu hoi roi tao app moi — chu de hien thi key la mot dac tinh, khong phai
lo hien.

**Xac thuc tai khoan phai do worker ANIVIET lam.** Token do client gui, client
la bat ky ai. Worker nay goi `/api/auth/me` cua ANIVIET roi dung `user.id`
tra ve, chu khong tin `user_id` gui kèm. Xem `requireUser`.

**`AUTH_TTL_SECONDS` la mot do doi doi chieu.** Cache 60 giay nghia la
dang xuat o ANIVIET co hieu luc toi da lau nhat 60 giay. Dat `0` neu can
hieu luc ngay lap tuc.
