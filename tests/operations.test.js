import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("D1 snapshot round-trip preserves large Thai text, quotes, newlines and null within statement limits", () => {
  const value = "ข้อมูลจำลอง'\n".repeat(15000);
  const result = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import sys, sqlite3, hashlib, json
sys.path.insert(0, 'scripts')
from snapshot_sql import render_snapshot
value = sys.stdin.read()
schema = [{'type': 'table', 'sql': 'CREATE TABLE config(id TEXT PRIMARY KEY, data TEXT NOT NULL, optional TEXT)'}]
columns = {'config': [{'name': 'id', 'pk': 1}, {'name': 'data', 'pk': 0}, {'name': 'optional', 'pk': 0}]}
sql = render_snapshot(schema, ['config'], columns, [[['system', value, None]]], [])
db = sqlite3.connect(':memory:')
db.executescript(sql)
restored, optional = db.execute("SELECT data,optional FROM config WHERE id='system'").fetchone()
assert restored == value and optional is None
# Each generated statement occupies one line except quoted user text, which may contain newlines.
statements = []
buffer = ''
for line in sql.splitlines(True):
    buffer += line
    if sqlite3.complete_statement(buffer):
        statements.append(buffer)
        buffer = ''
print(json.dumps({'sha256': hashlib.sha256(restored.encode()).hexdigest(), 'maxStatementBytes': max(len(s.encode()) for s in statements), 'statements': len(statements)}))
`,
      ],
      { input: value, encoding: "utf8" },
    ),
  );
  assert.equal(result.sha256, createHash("sha256").update(value).digest("hex"));
  assert.ok(result.maxStatementBytes <= 90000);
  assert.ok(result.statements > 2);
});

test("recovery refuses a damaged backup before opening a database", () => {
  const directory = mkdtempSync(join(tmpdir(), "bs-sams-checksum-test-"));
  try {
    writeFileSync(join(directory, "database.sql"), "SELECT 1;\n");
    writeFileSync(
      join(directory, "manifest.json"),
      JSON.stringify({ sha256: "incorrect" }),
    );
    const result = spawnSync(
      process.execPath,
      [
        "scripts/verify-recovery.mjs",
        "--snapshot",
        join(directory, "database.sql"),
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Backup checksum mismatch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
