import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { duplicateSelection } from "../server/duplicates.js";
import { QueryError } from "../server/people.js";
test("duplicate checks require corroborating identity data and validate input", () => {
  const u = { role: "admin" };
  assert.equal(duplicateSelection(u, { first: "ทดสอบ", last: "ระบบ" }), null);
  for (const b of [
    null,
    [],
    { first: {} },
    { birth: "2026-02-30" },
    { phone: "bad" },
    { nationalId: "123" },
  ])
    assert.throws(() => duplicateSelection(u, b), QueryError);
});
test("duplicate checks combine names with birth or phone, exclude self, and respect scope", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE people(id TEXT,village INTEGER,data TEXT,national_id TEXT,deleted_at TEXT)",
  );
  const insert = db.prepare("INSERT INTO people VALUES(?,?,?,?,?)");
  for (const [id, village, deleted] of [
    ["p1", 1, null],
    ["p2", 2, null],
    ["p3", 1, "deleted"],
  ])
    insert.run(
      id,
      village,
      JSON.stringify({
        first: " บุคคล ",
        last: "ทดสอบ",
        birth: "1990-01-01",
        phone: "0812345678",
      }),
      null,
      deleted,
    );
  function find(user, b) {
    const s = duplicateSelection(user, b);
    return s
      ? db
          .prepare(`SELECT id FROM people WHERE ${s.where} ORDER BY id`)
          .all(...s.args)
          .map((p) => p.id)
      : [];
  }
  const body = { first: "บุคคล", last: "ทดสอบ", birth: "1990-01-01" };
  assert.deepEqual(find({ role: "admin" }, body), ["p1", "p2"]);
  const staff = { role: "staff", permissions: ["view"], villages: [1] };
  assert.deepEqual(find(staff, body), ["p1"]);
  assert.deepEqual(find(staff, { ...body, id: "p1" }), []);
  assert.deepEqual(find(staff, { ...body, birth: "1991-01-01" }), []);
  assert.deepEqual(
    find(staff, { ...body, birth: "1991-01-01", phone: "0812345678" }),
    ["p1"],
  );
  assert.deepEqual(find({ ...staff, permissions: [] }, body), []);
  assert.deepEqual(find(staff, { ...body, first: "' OR 1=1 --" }), []);
  db.close();
});
