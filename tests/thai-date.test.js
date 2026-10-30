import test from "node:test";
import assert from "node:assert/strict";
import { formatThaiDate, parseThaiDate } from "../src/thai-date.js";
test("Thai Buddhist dates round-trip without timezone conversion", () => {
  assert.equal(formatThaiDate("2026-10-30"), "30/10/2569");
  assert.equal(parseThaiDate("30/10/2569"), "2026-10-30");
  assert.equal(parseThaiDate("29/02/2567"), "2024-02-29");
  assert.equal(parseThaiDate("1/1/2533"), "1990-01-01");
  assert.equal(formatThaiDate(""), "");
  for (const value of [
    "29/02/2569",
    "31/04/2569",
    "00/01/2569",
    "30/13/2569",
    "2026-10-30",
    "30/10/26",
  ])
    assert.equal(parseThaiDate(value), null);
});
