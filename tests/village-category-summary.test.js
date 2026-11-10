import test from "node:test";
import assert from "node:assert/strict";
import { categories, summarize } from "../src/domain.js";
const request = (category, type = "ทดสอบ", date = "2026-10-01") => ({
  category,
  type,
  date,
  status: "pending",
  payments: [],
});
test("village category counts deduplicate people, include category zero and respect selected dates", () => {
  const result = summarize(
    [
      {
        village: 1,
        requests: [
          request(0),
          request(0, "อีกประเภท"),
          request(1),
          request(2, "นอกช่วง", "2026-09-30"),
        ],
      },
      { village: 3, requests: [request(1)] },
      { village: 6, requests: [request(0, "อนาคต", "2026-11-01")] },
    ],
    "2026-10-01",
    "2026-10-31",
  );
  assert.deepEqual(result.villages, { 1: 1, 3: 1 });
  assert.deepEqual(result.villagesByCategory[0], { 1: 1 });
  assert.deepEqual(result.villagesByCategory[1], { 1: 1, 3: 1 });
  assert.deepEqual(
    result.villagesByCategory.slice(2),
    categories.slice(2).map(() => ({})),
  );
  assert.deepEqual(
    summarize([], "2026-10-01", "2026-10-31").villagesByCategory,
    categories.map(() => ({})),
  );
});
