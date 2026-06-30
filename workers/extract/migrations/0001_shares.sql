-- Shared projects schema for the Manila Worker (Cloudflare D1).
--
-- A "share" is a project two or more people can both write to. Membership is
-- by Google account email (verified server-side from the caller's Google
-- access token — clients can never assert an arbitrary identity). Expenses
-- carry the email of whoever added them so we can enforce "only the author can
-- edit or delete it".

CREATE TABLE IF NOT EXISTS shares (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  scheme      TEXT NOT NULL,            -- 'schedule_e' | 'schedule_c' | 'custom'
  categories  TEXT NOT NULL,            -- JSON array of category strings
  owner_email TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS share_members (
  share_id TEXT NOT NULL,
  email    TEXT NOT NULL,               -- always stored lower-cased
  role     TEXT NOT NULL,               -- 'owner' | 'member'
  added_at TEXT NOT NULL,
  PRIMARY KEY (share_id, email)
);

CREATE TABLE IF NOT EXISTS share_expenses (
  id             TEXT PRIMARY KEY,
  share_id       TEXT NOT NULL,
  title          TEXT NOT NULL,
  date           TEXT NOT NULL,
  category       TEXT NOT NULL,
  amount         REAL NOT NULL,
  currency       TEXT NOT NULL,
  notes          TEXT,
  added_by_email TEXT NOT NULL,         -- lower-cased; the author
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_members_email   ON share_members(email);
CREATE INDEX IF NOT EXISTS idx_expenses_share  ON share_expenses(share_id);
