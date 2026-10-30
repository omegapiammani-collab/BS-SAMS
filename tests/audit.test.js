import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { auditSelection } from "../server/audit.js";
import { QueryError } from "../server/people.js";
test("audit filters validate page, dates and action allowlist", () => {
  for (const bad of [
    "from=2026-02-30",
    "from=2026-10-30&to=2026-10-29",
    "size=101",
    "page=0",
    "action=constructor",
  ])
    assert.throws(() => auditSelection(new URLSearchParams(bad)), QueryError);
  assert.equal(auditSelection(new URLSearchParams()).size, 25);
});
test("audit migration retains legacy rows and dates use Thailand midnight boundaries", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  db.exec(
    "INSERT INTO users VALUES('u1','renamed','ทดสอบ','not-a-real-hash','admin','[]','[]',0,1)",
  );
  db.exec(
    "INSERT INTO audit(actor,action,target,created_at) VALUES('u1','create-person','legacy','2026-10-29 16:59:59')",
  );
  db.exec(readFileSync("migrations/0003_audit_history.sql", "utf8"));
  const insert = db.prepare(
    "INSERT INTO audit(actor,action,target,created_at,actor_username) VALUES(?,?,?,?,?)",
  );
  insert.run("u1", "update-person", "start", "2026-10-29 17:00:00", "original");
  insert.run("u1", "update-person", "end", "2026-10-30 16:59:59", "original");
  insert.run(
    "u1",
    "update-person",
    "nextday",
    "2026-10-30 17:00:00",
    "original",
  );
  function find(s) {
    const q = auditSelection(new URLSearchParams(s));
    return db
      .prepare(
        `SELECT a.* FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE ${q.where} ORDER BY a.id DESC`,
      )
      .all(...q.args);
  }
  assert.deepEqual(
    find("from=2026-10-30&to=2026-10-30").map((r) => r.target),
    ["end", "start"],
  );
  assert.equal(find("actor=original").length, 3);
  assert.equal(find("actor=renamed").length, 1);
  assert.equal(find("actor=u1").length, 4);
  assert.equal(find("target=legacy")[0].actor_username, null);
  assert.equal(find("target=%").length, 0);
  assert.equal(find("actor=' OR 1=1 --").length, 0);
  assert.equal(find("action=create-person").length, 1);
  db.close();
});
