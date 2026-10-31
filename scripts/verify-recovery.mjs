import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { localFixture, wrangler } from "./local-fixture.mjs";
const { values } = parseArgs({ options: { snapshot: { type: "string" } } });
if (!values.snapshot) throw new Error("Use --snapshot path/to/database.sql");
const snapshot = resolve(values.snapshot);
const manifest = JSON.parse(
  readFileSync(join(dirname(snapshot), "manifest.json"), "utf8"),
);
const sha256 = createHash("sha256")
  .update(readFileSync(snapshot))
  .digest("hex");
assert.equal(
  sha256,
  manifest.sha256,
  "Backup checksum mismatch; refusing restore",
);
const fixture = localFixture();
const started = performance.now();
try {
  wrangler([
    "d1",
    "execute",
    "bs-sams",
    "--local",
    "--persist-to",
    fixture.state,
    "--file",
    snapshot,
    "--json",
  ]);
  const result = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import sqlite3, pathlib, json, hashlib, sys
snapshot, directory = sys.argv[1:]
expected = sqlite3.connect(':memory:')
expected.executescript(pathlib.Path(snapshot).read_text())
files = list(pathlib.Path(directory).rglob('*.sqlite'))
candidates = []
for path in files:
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if {'users', 'sessions', 'people', 'audit', 'config', 'login_limits'}.issubset(tables):
        candidates.append(connection)
    else:
        connection.close()
assert len(candidates) == 1, 'Expected one application D1 database'
actual = candidates[0]
names = sorted(row[0] for row in expected.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'"))
def inspect(db):
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    data, counts = {}, {}
    for name in names:
        quoted = '"' + name.replace('"', '""') + '"'
        rows = sorted(db.execute('SELECT * FROM ' + quoted).fetchall(), key=lambda row: json.dumps(row, ensure_ascii=False))
        counts[name] = len(rows)
        data[name] = {'columns': db.execute('PRAGMA table_info(' + quoted + ')').fetchall(), 'indexes': sorted(db.execute('PRAGMA index_list(' + quoted + ')').fetchall(), key=lambda row: row[1]), 'rows': rows}
        data[name]['schema'] = db.execute("SELECT type,name,sql FROM sqlite_master WHERE tbl_name=? AND sql IS NOT NULL ORDER BY type,name", (name,)).fetchall()
        # SQLite's internal index sequence can differ, so compare index definitions by name.
        data[name]['indexes'] = [row[1:] for row in data[name]['indexes']]
    data['sqlite_sequence'] = sorted(db.execute('SELECT name,seq FROM sqlite_sequence').fetchall())
    digest = hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return digest, counts
expected_digest, expected_counts = inspect(expected)
actual_digest, counts = inspect(actual)
assert expected_digest == actual_digest, 'Restored schema/data differ from backup'
assert expected_counts == counts
print(json.dumps({'logicalSha256': actual_digest, 'tables': counts, 'integrity': 'ok', 'foreignKeys': 'ok'}))
`,
        snapshot,
        fixture.state,
      ],
      { encoding: "utf8" },
    ),
  );
  // A production recovery must revoke old sessions, including sessions valid in the snapshot.
  fixture.sql("DELETE FROM sessions;");
  const sessionCheck = JSON.parse(
    fixture.sql("SELECT COUNT(*) AS total FROM sessions;"),
  );
  assert.equal(sessionCheck[0].results[0].total, 0);
  const report = {
    ...result,
    snapshotSha256: sha256,
    verifiedAt: new Date().toISOString(),
    restoreAndVerifyMs: Math.round(performance.now() - started),
    sessionsRevoked: true,
    environment: "isolated local D1; production unchanged",
  };
  writeFileSync(
    join(dirname(snapshot), "verification.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  fixture.cleanup();
}
