import test from "node:test";
import assert from "node:assert/strict";
import { reportExport } from "../src/report-export.js";
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
});
