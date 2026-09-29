-- ============================================================
-- ANIGLOBAL — bang app client
-- ============================================================
-- Chay trong Cloudflare Dashboard > D1 SQL Console, hoac:
--   npx wrangler d1 execute aniglobal-apps --file=schema.sql
-- (day la tai lieu de ban chay, khong phai lenh ban can chay)
--
-- `client_id` la khoa chinh TEXT. D1 khong co AUTOINCREMENT tren
-- TEXT, nen ID sinh o worker bang crypto.getRandomValues.
--
-- `key_hash` luu SHA-256 cua client key. KHONG BAO GIO luu ban ro:
-- worker tra key ra mot lan roi quen di. Muon xem lai thi thu hoi
-- roi tao app moi.
-- ============================================================

CREATE TABLE IF NOT EXISTS apps (
  client_id      TEXT    PRIMARY KEY,
  owner_user_id  INTEGER NOT NULL,
  name           TEXT    NOT NULL,
  region         TEXT    NOT NULL,
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

-- Tra cuu app bang key hash khi xac thuc client. Phai la UNIQUE:
-- hai app khac nhau khong duoc chung mot key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_key_hash
  ON apps (key_hash);

-- Loc app dang hieu luc cho bao cao.
CREATE INDEX IF NOT EXISTS idx_apps_status
  ON apps (status);
