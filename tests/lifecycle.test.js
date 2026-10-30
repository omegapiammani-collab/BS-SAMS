import test from "node:test";
import assert from "node:assert/strict";
import { lifecyclePlan } from "../server/lifecycle.js";
test("lifecycle validation requires a version and a bounded deletion reason", () => {
  const active = { version: 5, deleted_at: null };
  for (const b of [
    null,
    {},
    { version: 0, reason: "x" },
    { version: 5, reason: 5 },
    { version: 5, reason: "" },
    { version: 5, reason: "x".repeat(1001) },
  ])
    assert.equal(lifecyclePlan(active, "delete", b).status, 400);
  assert.equal(
    lifecyclePlan(active, "delete", { version: 4, reason: "x" }).status,
    409,
  );
  assert.deepEqual(
    lifecyclePlan(active, "delete", { version: 5, reason: " เหตุผล " }),
    { unchanged: false, version: 5, reason: "เหตุผล" },
  );
});
test("retries converge without treating stale restore/delete as another transition", () => {
  const active = { version: 5, deleted_at: null },
    deleted = { version: 6, deleted_at: "2026-10-30" };
  assert.equal(
    lifecyclePlan(deleted, "delete", { version: 5, reason: "เดิม" }).unchanged,
    true,
  );
  assert.equal(
    lifecyclePlan(active, "restore", { version: 4 }).unchanged,
    true,
  );
  assert.equal(lifecyclePlan(deleted, "restore", { version: 5 }).status, 409);
  assert.equal(
    lifecyclePlan({ ...active, version: 7 }, "delete", {
      version: 5,
      reason: "เดิม",
    }).status,
    409,
  );
});
