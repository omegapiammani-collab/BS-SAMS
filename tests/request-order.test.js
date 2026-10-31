import test from "node:test";
import assert from "node:assert/strict";
import { orderRequests } from "../src/request-order.js";
test("requests of the same type stay together and occurrence dates are chronological", () => {
  const requests = [
    { id: "r1", type: "ครอบครัวผู้มีรายได้น้อย", date: "2026-10-30" },
    { id: "r2", type: "กรณีฉุกเฉิน", date: "2026-10-30" },
    { id: "r3", type: "ครอบครัวผู้มีรายได้น้อย", date: "2026-06-10" },
    { id: "r4", type: "ครอบครัวผู้มีรายได้น้อย", date: "2026-10-30" },
  ];
  const original = structuredClone(requests);
  assert.deepEqual(
    orderRequests(requests).map((r) => r.id),
    ["r3", "r1", "r4", "r2"],
  );
  assert.deepEqual(requests, original);
  assert.deepEqual(orderRequests([]), []);
});
