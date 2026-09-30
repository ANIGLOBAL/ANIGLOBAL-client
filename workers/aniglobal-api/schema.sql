-- ============================================================
-- ANIGLOBAL — bang app client
-- ============================================================
-- Database dung chung: aniglobal-globalDB
--   Cloudflare Dashboard > D1 > aniglobal-globalDB > Console
-- Hoac:
--   npx wrangler d1 execute aniglobal-globalDB --file=schema.sql
--
-- `client_id` la khoa chinh TEXT. D1 khong co AUTOINCREMENT tren
-- TEXT, nen ID sinh o worker bang crypto.getRandomValues.
--
-- `key_hash` luu SHA-256 cua client key. KHONG BAO GIO luu ban ro:
-- worker tra key ra mot lan roi quen di. Muon xem lai thi thu hoi
-- roi tao app moi.
--
-- `region` va `site` la HAI COT RIENG:
--   region = ASIA          vung dia ly
--   site   = ANIVIET       site quoc gia nam trong vung do
-- Gop chung mot cot se khong phan biet duoc app cua site nao thuoc
-- vung nao, va doc nham "region" la site la mau thuan.
-- ============================================================

CREATE TABLE IF NOT EXISTS apps (
  client_id      TEXT    PRIMARY KEY,
  owner_user_id  INTEGER NOT NULL,

  -- Ten app nguoi dung dat luc dang ky.
  name           TEXT    NOT NULL,

  -- Vung dia ly, vi du ASIA.
  region         TEXT    NOT NULL,

  -- Site quoc gia trong vung do, vi du ANIVIET.
  site           TEXT    NOT NULL,

  scope          TEXT    NOT NULL,
  key_hash       TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'active',
  created_at     TEXT    NOT NULL,
  last_used_at   TEXT,
  request_count  INTEGER NOT NULL DEFAULT 0
);

-- Danh sach app cua mot nguoi, moi nhat len dau.
CREATE INDEX IF NOT EXISTS idx_apps_owner
  ON apps (owner_user_id, created_at DESC);

-- Loc app theo vung, va theo site trong vung.
-- Truy van danh sach app tren trang site luon kem ca hai cot nay.
CREATE INDEX IF NOT EXISTS idx_apps_region
  ON apps (region, site, created_at DESC);

-- Tra cuu app bang key hash khi xac thuc client. Phai la UNIQUE:
-- hai app khac nhau khong duoc chung mot key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_key_hash
  ON apps (key_hash);

-- Loc app dang hieu luc cho bao cao.
CREATE INDEX IF NOT EXISTS idx_apps_status
  ON apps (status);


-- ============================================================
-- MIGRATION — chi can chay neu da tung chay schema phien ban CU
-- ============================================================
-- Ban cu chi co mot cot `region` va luu ten site vao do nen khong
-- phan biet duoc. Can chuyen doi lai:
--
--   ALTER TABLE apps ADD COLUMN site TEXT;
--   UPDATE apps SET site = region WHERE site IS NULL;
--
-- Sau do xoa cot `region` cu va them lai:
--
--   ALTER TABLE apps DROP COLUMN region;
--
-- Do khong the khong bao gio con bang "khu vuc" o ban cu, nen cach
-- an toan nhat la XOA bang roi chay lai schema moi:
--
--   DROP TABLE apps;
--
-- roi chay phan CREATE TABLE o tren mot lan nua.
-- ============================================================
