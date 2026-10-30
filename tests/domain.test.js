import test from "node:test";
import assert from "node:assert/strict";
import {
  age,
  fiscalRange,
  personStatus,
  summarize,
  validatePerson,
  defaultConfig,
} from "../src/domain.js";
import { allowed, hashPassword, verifyPassword } from "../server/auth.js";
test("age respects birthday and leap day", () => {
  assert.equal(age("2000-11-01", "2026-10-30"), 25);
  assert.equal(age("2000-10-30", "2026-10-30"), 26);
  assert.equal(age("2000-02-29", "2025-02-28"), 24);
});
test("Thai fiscal year 2570 spans October 2026 to September 2027", () =>
  assert.deepEqual(fiscalRange(2570), ["2026-10-01", "2027-09-30"]));
test("partial assistance and closed cases are distinct", () => {
  assert.equal(
    personStatus({ requests: [{ status: "done" }, { status: "pending" }] }),
    "partial",
  );
  assert.equal(personStatus({ requests: [{ status: "rejected" }] }), "closed");
  assert.equal(personStatus({ requests: [] }), "none");
});
test("report counts people once within category, payments on actual date", () => {
  const p = {
    village: 1,
    birth: "2000-01-01",
    requests: [
      {
        category: "0",
        status: "done",
        date: "2026-10-02",
        payments: [{ date: "2026-10-05", amount: 100 }],
      },
      { category: "0", status: "pending", date: "2026-10-03", payments: [] },
      {
        category: "1",
        status: "done",
        date: "2025-02-02",
        payments: [{ date: "2026-10-08", amount: 200 }],
      },
    ],
  };
  const s = summarize([p], ...fiscalRange(2570));
  assert.equal(s.people, 1);
  assert.equal(s.requests, 2);
  assert.equal(s.category[0], 1);
  assert.equal(s.amount, 300);
  assert.equal(s.partial, 1);
});
test("permission requires both capability and assigned village", () => {
  const u = { role: "staff", permissions: ["view", "edit"], villages: [1] };
  assert.equal(allowed(u, "view", 1), true);
  assert.equal(allowed(u, "view", 2), false);
  assert.equal(allowed(u, "export", 1), false);
});
test("password hashes are salted and verify", async () => {
  const a = await hashPassword("correct-password"),
    b = await hashPassword("correct-password");
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("correct-password", a));
  assert.equal(await verifyPassword("wrong", a), false);
});
test("request closure needs a reason and completion needs assistance", () => {
  const p = {
    first: "ตัวอย่าง",
    last: "ทดสอบ",
    village: 1,
    disabilities: [],
    requests: [
      {
        category: "0",
        type: "สงเคราะห์",
        date: "2026-10-01",
        status: "rejected",
        payments: [],
      },
    ],
  };
  assert.match(validatePerson(p, defaultConfig), /เหตุผล/);
  p.requests[0].status = "done";
  assert.match(validatePerson(p, defaultConfig), /บันทึกการช่วยเหลือ/);
});
