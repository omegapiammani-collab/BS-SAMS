import test from "node:test";
import assert from "node:assert/strict";
import { reportExport } from "../src/report-export.js";
import { summarize, categories } from "../src/domain.js";
const sum = {
  category: [2],
  villages: { 1: 2 },
  people: 2,
  helpedPeople: 1,
  helpedEvents: 3,
  monthly: [
    {
      month: "2026-10",
      requestedPeople: 2,
      requested: 3,
      helpedPeople: 1,
      helped: 3,
      amount: 3000.3,
    },
  ],
};
const config = { villages: [{ id: 1, name: "ทดสอบ" }] };
const range = ["2026-10-01", "2026-10-31"];
test("summary and monthly exports contain only their own table", () => {
  const summary = reportExport(sum, config, range, "village", "summary");
  assert.deepEqual(summary.rows[0], ["ช่วงวันที่", "01/10/2569", "31/10/2569"]);
  assert.ok(summary.rows.some((row) => row[0] === "หมู่ 1 บ้านทดสอบ"));
  assert.equal(
    summary.rows.some((row) => row[0] === "เดือน"),
    false,
  );
  const monthly = reportExport(sum, config, range, "village", "monthly");
  assert.ok(monthly.rows.some((row) => row[5] === 3000.3));
  assert.equal(JSON.stringify(monthly.rows).includes("บ้านทดสอบ"), false);
  assert.equal(monthly.name, "รายละเอียดรายเดือน");
  assert.notEqual(summary.name, monthly.name);
  assert.deepEqual(monthly.rows[0], summary.rows[0]);
});

test("category exports count each person once per assistance type within the date range", () => {
  const request = (category, type, date = "2026-10-01") => ({
    category,
    type,
    date,
    status: "pending",
    payments: [],
  });
  const people = [
    {
      village: 1,
      requests: [
        request("0", "เด็ก"),
        request("0", "เด็ก"),
        request("0", "ผู้สูงอายุ"),
        request("1", "เด็ก"),
        request("0", "นอกช่วง", "2026-09-30"),
      ],
    },
    { village: 1, requests: [request("0", "เด็ก")] },
  ];
  const summary = summarize(people, ...range);
  assert.equal(summary.people, 2);
  assert.equal(summary.category[0], 2);
  assert.deepEqual(summary.assistanceTypes, [
    { category: 0, type: "เด็ก", people: 2 },
    { category: 0, type: "ผู้สูงอายุ", people: 1 },
    { category: 1, type: "เด็ก", people: 1 },
  ]);
  const output = reportExport(summary, config, range, "category", "summary");
  assert.deepEqual(output.rows[3], [
    "หมวดหมู่",
    "ประเภทความช่วยเหลือ",
    "จำนวนคน",
  ]);
  assert.deepEqual(output.rows.slice(4, 8), [
    [categories[0], "เด็ก", 2],
    [categories[0], "ผู้สูงอายุ", 1],
    [categories[1], "เด็ก", 1],
    [categories[2], "", 0],
  ]);
  assert.ok(
    output.rows.some((row) => row[0] === "ยอดรวมผู้ยื่นคำขอ" && row[1] === 2),
  );
  assert.ok(!JSON.stringify(output.rows).includes("นอกช่วง"));
});
