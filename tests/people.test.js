import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { personStatus, statuses, submissionChannels } from "../src/domain.js";
import { matchesRequestFilters } from "../src/request-filters.js";
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
    "channel=constructor",
    "channel=unspecified",
    "channel=DROP TABLE",
  ])
    assert.throws(() => query(bad), QueryError);
});

test("date filter parsing validates ISO dates and permits open-ended inclusive ranges", () => {
  assert.equal(query("requestFrom=2026-10-01").requestFrom, "2026-10-01");
  assert.equal(query("receivedTo=2026-10-31").receivedTo, "2026-10-31");
  for (const invalid of [
    "requestFrom=01/10/2569",
    "requestTo=2026-02-30",
    "receivedFrom=invalid",
    "receivedTo=2026-13-01",
    "requestFrom=2026-11-01&requestTo=2026-10-01",
    "receivedFrom=2026-11-01&receivedTo=2026-10-01",
  ])
    assert.throws(() => query(invalid), QueryError);
});

test("date filters match the same request and payment, retain permissions, and run before pagination", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE people(id TEXT, village INTEGER, data TEXT, national_id TEXT, deleted_at TEXT)",
  );
  const request = (category, date, payments = []) => ({
    category,
    date,
    payments: payments.map((date) => ({ date })),
    status: "pending",
  });
  const fixtures = [
    ["a", 1, null, [request("0", "2026-10-01", ["2026-10-31"])]],
    ["b", 1, null, [request("0", "2026-10-31", ["2026-10-01"])]],
    ["c", 1, null, [request("0", "2026-09-30", ["2026-10-15"])]],
    ["d", 1, null, [request("0", "2026-10-15", ["2026-11-01"])]],
    [
      "e",
      1,
      null,
      [
        request("0", "2026-09-30", ["2026-10-15"]),
        request("1", "2026-10-15", ["2026-11-01"]),
      ],
    ],
    ["f", 1, null, [request("0", "2026-10-15", ["2026-09-30", "2026-11-01"])]],
    ["g", 1, null, [request("0", "2026-10-15")]],
    ["h", 2, null, [request("0", "2026-10-15", ["2026-10-15"])]],
    ["i", 1, "deleted", [request("0", "2026-10-15", ["2026-10-15"])]],
  ];
  const insert = db.prepare("INSERT INTO people VALUES(?,?,?,?,?)");
  for (const [id, village, deleted, requests] of fixtures)
    insert.run(
      id,
      village,
      JSON.stringify({ first: id, last: "test", requests }),
      null,
      deleted,
    );
  const get = (filter, user = admin, exporting = false) => {
    const parsed = query(filter);
    const selection = peopleSelection(user, parsed, exporting);
    return db
      .prepare(
        `SELECT id FROM people WHERE ${selection.where} ORDER BY ${selection.order} LIMIT ? OFFSET ?`,
      )
      .all(...selection.args, parsed.size, (parsed.page - 1) * parsed.size)
      .map((row) => row.id);
  };
  const range =
    "requestFrom=2026-10-01&requestTo=2026-10-31&receivedFrom=2026-10-01&receivedTo=2026-10-31";
  assert.deepEqual(get(range), ["a", "b", "h"]);
  assert.deepEqual(get(range + "&size=1&page=2"), ["b"]);
  assert.deepEqual(get(range + "&cat=0&village=1"), ["a", "b"]);
  assert.deepEqual(
    get("cat=0&requestFrom=2026-10-01&requestTo=2026-10-31&village=1"),
    ["a", "b", "d", "f", "g"],
  );
  assert.deepEqual(
    get("receivedFrom=2026-10-01&receivedTo=2026-10-31&village=1"),
    ["a", "b", "c", "e"],
  );
  assert.deepEqual(get(range + "&trash=1"), ["i"]);
  const staff = {
    role: "staff",
    permissions: ["view", "export"],
    villages: [1],
  };
  assert.deepEqual(get(range, staff, true), ["a", "b"]);
  assert.deepEqual(get(range, { ...staff, permissions: ["view"] }, true), []);
  assert.deepEqual(get("requestTo=2026-09-30&village=1"), ["c", "e"]);
  for (const filter of [
    "",
    range,
    range + "&cat=1",
    "requestFrom=2026-10-01",
    "requestTo=2026-10-01",
    "receivedFrom=2026-10-31",
    "receivedTo=2026-10-01",
    "cat=0&requestFrom=2026-10-01",
  ])
    assert.deepEqual(
      get(filter),
      fixtures
        .filter(
          ([, , deleted, requests]) =>
            !deleted &&
            requests.some((request) =>
              matchesRequestFilters(request, query(filter)),
            ),
        )
        .map(([id]) => id),
    );
  db.close();
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

test("submission channel filters are exclusive and retain village, trash and export restrictions", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE people(id TEXT, village INTEGER, data TEXT, national_id TEXT, deleted_at TEXT)",
  );
  const insert = db.prepare("INSERT INTO people VALUES(?,?,?,?,?)");
  for (const [id, channels, village, deleted] of [
    ["care", [submissionChannels[0]], 1, null],
    ["hotline", [submissionChannels[1]], 1, null],
    ["both", submissionChannels, 1, null],
    ["missing", undefined, 1, null],
    ["empty", [], 1, null],
    ["other-village", submissionChannels, 2, null],
    ["trash", submissionChannels, 1, "deleted"],
  ])
    insert.run(
      id,
      village,
      JSON.stringify({
        first: id,
        last: "test",
        submissionChannels: channels,
        requests: [],
      }),
      null,
      deleted,
    );
  const get = (filter, user = admin, exporting = false) => {
    const selection = peopleSelection(user, query(filter), exporting);
    return db
      .prepare(`SELECT id FROM people WHERE ${selection.where} ORDER BY id`)
      .all(...selection.args)
      .map((row) => row.id);
  };
  assert.deepEqual(get("channel=care"), ["care"]);
  assert.deepEqual(get("channel=hotline"), ["hotline"]);
  assert.deepEqual(get("channel=both"), ["both", "other-village"]);
  assert.ok(get("").includes("empty"));
  assert.ok(get("").includes("missing"));
  assert.deepEqual(get("channel=both&trash=1"), ["trash"]);
  assert.deepEqual(get("channel=both&village=1"), ["both"]);
  const staff = {
    role: "staff",
    permissions: ["view", "export"],
    villages: [1],
  };
  assert.deepEqual(get("channel=both", staff, true), ["both"]);
  assert.deepEqual(
    get("channel=both", { ...staff, permissions: ["view"] }, true),
    [],
  );
  db.close();
});
