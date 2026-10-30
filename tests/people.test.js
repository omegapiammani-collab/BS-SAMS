import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { personStatus, statuses } from "../src/domain.js";
import {
  parsePeopleQuery,
  peopleSelection,
  statusSql,
  QueryError,
} from "../server/people.js";
const admin = { role: "admin" };
const query = (s) => parsePeopleQuery(new URLSearchParams(s));
test("query parser bounds pagination and rejects invalid filters", () => {
  assert.equal(query("cat=0").cat, "0");
  for (const bad of [
    "page=0",
    "page=-1",
    "size=101",
    "size=1.2",
    "status=constructor",
    "cat=7",
    "direction=DROP TABLE",
    "sort=password",
    "village=NaN",
  ])
    assert.throws(() => query(bad), QueryError);
});
test("SQLite status classification matches every three-request combination", () => {
  const db = new DatabaseSync(":memory:");
  const stmt = db.prepare(
    `SELECT ${statusSql} AS status FROM (SELECT ? AS data)`,
  );
  const values = Object.keys(statuses).flatMap((status) => [
    { status, payments: [] },
    { status, payments: [{ amount: 1 }] },
  ]);
  const check = (requests) =>
    assert.equal(
      stmt.get(JSON.stringify({ requests })).status,
      personStatus({ requests }),
      JSON.stringify(requests),
    );
  check([]);
  for (const a of values) {
    check([a]);
    for (const b of values) {
      check([a, b]);
      for (const c of values) check([a, b, c]);
    }
  }
  db.close();
});
test("SQL filters before paging and enforces village and export permissions", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE people(id TEXT, village INTEGER, data TEXT, national_id TEXT,deleted_at TEXT)",
  );
  const insert = db.prepare("INSERT INTO people VALUES(?,?,?,?,?)");
  for (let i = 0; i < 27; i++)
    insert.run(
      String(i),
      i < 22 ? 1 : 2,
      JSON.stringify({
        first: `ทดสอบ${String(i).padStart(2, "0")}`,
        last: "ตัวอย่าง",
        requests: [
          { category: String(i % 2), status: "pending", payments: [] },
        ],
      }),
      null,
      i === 26 ? "deleted" : null,
    );
  function get(u, q, exporting = false) {
    const s = peopleSelection(u, q, exporting);
    return db
      .prepare(
        `SELECT id FROM people WHERE ${s.where} ORDER BY ${s.order} LIMIT ? OFFSET ?`,
      )
      .all(...s.args, q.size, (q.page - 1) * q.size)
      .map((p) => p.id);
  }
  assert.deepEqual(get(admin, query("size=10&page=3")), [
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
  ]);
  assert.deepEqual(get(admin, query("size=10&page=1&direction=desc")), [
    "25",
    "24",
    "23",
    "22",
    "21",
    "20",
    "19",
    "18",
    "17",
    "16",
  ]);
  const staff = {
    role: "staff",
    permissions: ["view", "export"],
    villages: [1],
  };
  assert.deepEqual(get(staff, query("page=3&size=10")), ["20", "21"]);
  assert.deepEqual(get(staff, query("village=2")), []);
  assert.deepEqual(get(staff, query("q=ทดสอบ00&cat=0&status=pending")), ["0"]);
  assert.deepEqual(get(admin, query("q=%")), []);
  assert.deepEqual(get(admin, query("q=' OR 1=1 --")), []);
  assert.deepEqual(
    get({ ...staff, permissions: ["view"] }, query(""), true),
    [],
  );
  assert.deepEqual(
    get({ ...staff, permissions: ["export"] }, query(""), true),
    [],
  );
  assert.deepEqual(get(admin, query("trash=1")), ["26"]);
  db.close();
});
