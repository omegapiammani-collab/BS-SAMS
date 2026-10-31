CREATE TABLE person_drafts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  person_id TEXT,
  base_version INTEGER,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,id)
);
CREATE INDEX person_drafts_expiry ON person_drafts(expires_at);
