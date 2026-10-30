import test from "node:test";
import assert from "node:assert/strict";
import { calendarDays, shiftMonth } from "../src/thai-calendar.js";
test("calendar uses Monday-first weeks and includes leap days and adjacent months", () => {
  const days = calendarDays("2024-02");
  assert.equal(days.length, 42);
  assert.equal(days[0].iso, "2024-01-29");
  assert.equal(days.filter((x) => x.current).length, 29);
  assert.ok(days.some((x) => x.iso === "2024-02-29" && x.current));
  assert.equal(calendarDays("2026-02").filter((x) => x.current).length, 28);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});
