PRAGMA foreign_keys = ON;
CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')), permissions TEXT NOT NULL, villages TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE people(id TEXT PRIMARY KEY, national_id TEXT UNIQUE, village INTEGER NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, deleted_by TEXT, delete_reason TEXT);
CREATE TABLE config(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE login_limits(key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE INDEX people_village ON people(village,deleted_at);
CREATE INDEX session_expiry ON sessions(expires);
