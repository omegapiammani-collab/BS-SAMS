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

test("registry list serialization excludes full case and identity details", async () => {
  const { personListItem } = await import("../server/people.js");
  const list = personListItem({
    id: "p1",
    version: 2,
    village: 1,
    deleted_at: null,
    data: JSON.stringify({
      title: "นาย",
      first: "ทดสอบ",
      last: "ระบบ",
      birth: "1990-01-01",
      nationalId: "1234567890123",
      phone: "0812345678",
      houseCode: "sensitive-house",
      house: "10",
      disabilities: ["ความพิการทางการเห็น"],
      requests: [
        {
          id: "r1",
          category: "0",
          type: "private-type",
          note: "private-note",
          status: "progress",
          payments: [
            {
              id: "pay1",
              date: "2026-10-01",
              provider: "provider",
              detail: "private-detail",
              amount: 100,
            },
          ],
        },
      ],
    }),
  });
  assert.equal(list.version, 2);
  assert.equal(list.status, "partial");
  assert.equal(list.categoryStatuses[0], "partial");
  assert.equal(list.categoryStatuses[1], "none");
  for (const field of [
    "nationalId",
    "phone",
    "birth",
    "house",
    "houseCode",
    "disabilities",
    "requests",
    "data",
  ])
    assert.equal(Object.hasOwn(list, field), false);
  assert.equal(JSON.stringify(list).includes("private"), false);
});

test("age filters respect birthday boundaries and disability membership", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE people(id TEXT,village INTEGER,data TEXT,national_id TEXT,deleted_at TEXT)",
  );
  const insert = db.prepare("INSERT INTO people VALUES(?,1,?,NULL,NULL)");
  const births = {
    child17: "2009-10-30",
    youth18: "2008-10-30",
    youth25: "2000-10-31",
    adult26: "2000-10-30",
    adult59: "1966-10-31",
    senior60: "1966-10-30",
    unknown: "",
  };
  for (const [id, birth] of Object.entries(births))
    insert.run(
      id,
      JSON.stringify({
        first: id,
        last: "test",
        birth,
        disabilities:
          id === "child17"
            ? ["ความพิการทางการเห็น", "ความพิการทางการเคลื่อนไหวหรือทางร่างกาย"]
            : [],
        requests: [],
      }),
    );
  function find(s) {
    const q = { ...query(s), asOf: "2026-10-30" },
      p = peopleSelection(admin, q);
    return db
      .prepare(`SELECT id FROM people WHERE ${p.where} ORDER BY id`)
      .all(...p.args)
      .map((r) => r.id);
  }
  assert.deepEqual(find("ageGroup=child"), ["child17"]);
  assert.deepEqual(find("ageGroup=youth"), ["youth18", "youth25"]);
  assert.deepEqual(find("ageGroup=adult"), ["adult26", "adult59"]);
  assert.deepEqual(find("ageGroup=senior"), ["senior60"]);
  assert.deepEqual(find("ageGroup=unknown"), ["unknown"]);
  assert.deepEqual(find("ageGroup=child&disability=2"), ["child17"]);
  assert.deepEqual(find("ageGroup=child&disability=none"), []);
  db.close();
});
test("request category, type and dates must match one request together", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE people(id TEXT,village INTEGER,data TEXT,national_id TEXT,deleted_at TEXT)",
  );
  db.prepare("INSERT INTO people VALUES('p1',1,?,NULL,NULL)").run(
    JSON.stringify({
      first: "test",
      requests: [
        { category: "0", type: "A", date: "2025-01-01" },
        { category: "1", type: "B", date: "2026-10-01" },
      ],
    }),
  );
  function count(s) {
    const p = peopleSelection(admin, query(s));
    return db
      .prepare(`SELECT COUNT(*) AS n FROM people WHERE ${p.where}`)
      .get(...p.args).n;
  }
  assert.equal(count("cat=0&requestType=B"), 0);
  assert.equal(count("cat=0&requestFrom=2026-10-01"), 0);
  assert.equal(
    count("cat=1&requestType=B&requestFrom=2026-10-01&requestTo=2026-10-01"),
    1,
  );
  for (const invalid of [
    "ageGroup=other",
    "disability=7",
    "requestFrom=2026-02-30",
    "requestFrom=2026-10-02&requestTo=2026-10-01",
  ])
    assert.throws(() => query(invalid), QueryError);
  const scoped = peopleSelection(
    {
      role: "staff",
      permissions: ["view", "export"],
      villages: Array.from({ length: 90 }, (_, i) => i + 1),
    },
    query(
      "ageGroup=adult&disability=0&cat=0&requestType=A&requestFrom=2026-01-01&requestTo=2026-12-31",
    ),
    true,
  );
  assert.ok(scoped.args.length < 20);
  db.close();
});
