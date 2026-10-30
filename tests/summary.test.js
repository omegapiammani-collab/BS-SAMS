import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { summaryQuery, readSummary } from "../server/summary.js";
import { parsePeopleQuery, peopleSelection } from "../server/people.js";
import { statuses } from "../src/domain.js";
import { summarize } from "./helpers/reference-summary.js";

function database(t, people = []) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  const insert = db.prepare(
    "INSERT INTO people(id,village,data,deleted_at) VALUES(?,?,?,?)",
  );
  db.exec("BEGIN");
  for (const [i, person] of people.entries())
    insert.run(
      String(i),
      person.village,
      JSON.stringify(person),
      person.deletedAt || null,
    );
  db.exec("COMMIT");
  return db;
}
function report(db, from, to, selection) {
  const q = summaryQuery(from, to, selection);
  return JSON.parse(db.prepare(q.sql).get(...q.args).summary);
}

// Deterministic mixed records make the comparison reproducible without external data.
function fixtures(count = 350) {
  const dates = [
    "2015-01-01",
    "2024-02-29",
    "2025-10-01",
    "2026-09-30",
    "2026-10-01",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
    "2027-10-01",
  ];
  const births = [
    "",
    null,
    "2008-10-30",
    "2008-10-31",
    "2000-10-30",
    "2000-10-31",
    "1966-10-30",
    "1966-10-31",
    "2000-02-29",
    "1980-01-01",
  ];
  return Array.from({ length: count }, (_, i) => ({
    village: (i % 17) + 1,
    birth: births[i % births.length],
    first: "ข้อมูลส่วนบุคคลห้ามออกในรายงาน",
    deletedAt: i % 19 === 0 ? "2026-10-01" : null,
    requests: Array.from({ length: i % 8 }, (_, j) => ({
      category: j % 2 ? String((i + j) % 7) : (i + j) % 7,
      date: dates[(i + j * 3) % dates.length],
      status: Object.keys(statuses)[(i + j) % 6],
      note: "บันทึกที่ไม่ควรถูกส่งออก".repeat(10),
      payments: Array.from({ length: (i + j) % 4 }, (_, k) => ({
        date: dates[(i * 3 + j + k) % dates.length],
        amount: ["0.10", 0.2, "999999999.99", "", null, "1e3", "12.34"][
          (i + j + k) % 7
        ],
        detail: "รายละเอียดการช่วยเหลือ",
      })),
    })),
  }));
}

test("empty SQL summaries retain every month including the 120-month limit", (t) => {
  const db = database(t);
  for (const [from, to] of [
    ["2026-10-30", "2026-10-30"],
    ["2016-01-01", "2025-12-31"],
    ["2024-02-29", "2024-03-01"],
  ])
    assert.deepEqual(report(db, from, to), summarize([], from, to));
});

test("SQL summaries match reference counts, birthday boundaries, decimal totals and independent payment dates", (t) => {
  const people = fixtures(),
    db = database(t, people);
  const active = people.filter((p) => !p.deletedAt);
  for (const [from, to] of [
    ["2026-10-01", "2027-09-30"],
    ["2026-10-30", "2026-10-30"],
    ["2026-10-31", "2026-11-01"],
    ["2024-02-01", "2024-02-29"],
    ["2025-01-01", "2027-10-31"],
  ])
    assert.deepEqual(
      report(db, from, to),
      summarize(active, from, to),
      `${from} to ${to}`,
    );
});

test("SQL summary completion matches every combination of up to three requests", (t) => {
  const db = database(t, [{ village: 1, requests: [] }]);
  const q = summaryQuery("2026-10-01", "2026-10-31"),
    stmt = db.prepare(q.sql);
  const update = db.prepare("UPDATE people SET data=? WHERE id='0'");
  const variants = Object.keys(statuses).flatMap((status) => [
    { category: "0", date: "2026-10-01", status, payments: [] },
    {
      category: "0",
      date: "2026-10-01",
      status,
      payments: [{ date: "2026-10-02", amount: "0.10" }],
    },
  ]);
  function check(requests) {
    const person = { village: 1, requests };
    update.run(JSON.stringify(person));
    assert.deepEqual(
      JSON.parse(stmt.get(...q.args).summary),
      summarize([person], "2026-10-01", "2026-10-31"),
    );
  }
  check([]);
  for (const a of variants) {
    check([a]);
    for (const b of variants) {
      check([a, b]);
      for (const c of variants) check([a, b, c]);
    }
  }
});

test("report exports apply the shared SQL capability and village scope before aggregation", (t) => {
  const people = fixtures(),
    db = database(t, people);
  const query = parsePeopleQuery(new URLSearchParams());
  for (const user of [
    { role: "admin" },
    { role: "staff", permissions: ["view", "export"], villages: [1, 2, 17] },
    { role: "staff", permissions: ["view"], villages: [1] },
    { role: "staff", permissions: ["export"], villages: [1] },
    { role: "staff", permissions: ["view", "export"], villages: [] },
  ]) {
    const selection = peopleSelection(user, query, true);
    const allowed = people.filter(
      (p) =>
        !p.deletedAt &&
        (user.role === "admin" ||
          (user.permissions.includes("view") &&
            user.permissions.includes("export") &&
            user.villages.includes(p.village))),
    );
    assert.deepEqual(
      report(db, "2026-10-01", "2027-10-31", selection),
      summarize(allowed, "2026-10-01", "2027-10-31"),
    );
  }
});

test("Worker reads one aggregate row without loading personal records", async (t) => {
  const people = fixtures(2000),
    db = database(t, people);
  let calls = 0;
  const adapter = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              calls++;
              const row = db.prepare(sql).get(...args);
              assert.deepEqual(Object.keys(row), ["summary"]);
              assert.ok(Buffer.byteLength(row.summary) < 25000);
              assert.equal(row.summary.includes("ข้อมูลส่วนบุคคล"), false);
              assert.equal(row.summary.includes("บันทึกที่ไม่ควร"), false);
              return row;
            },
          };
        },
      };
    },
  };
  assert.deepEqual(
    await readSummary(adapter, "2026-10-01", "2027-10-31"),
    summarize(
      people.filter((p) => !p.deletedAt),
      "2026-10-01",
      "2027-10-31",
    ),
  );
  assert.equal(calls, 1);
});
