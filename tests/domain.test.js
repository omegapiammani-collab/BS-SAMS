import test from "node:test";
import assert from "node:assert/strict";
import {
  age,
  fiscalRange,
  personStatus,
  summarize,
  validateReportRange,
  validatePerson,
  validatePersonUpdate,
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

test("completion requires every request to be helped, including closed requests", () => {
  assert.equal(
    personStatus({
      requests: [
        { status: "done", payments: [{}] },
        { status: "rejected", payments: [] },
      ],
    }),
    "partial",
  );
  assert.equal(
    personStatus({ requests: [{ status: "cancelled", payments: [{}] }] }),
    "closed",
  );
});

test("monthly reports keep the same month in different years separate", () => {
  const p = {
    village: 1,
    birth: "1990-01-01",
    requests: [
      {
        date: "2026-10-01",
        category: "0",
        status: "done",
        payments: [
          { date: "2026-10-02", amount: 100 },
          { date: "2026-10-03", amount: 50 },
        ],
      },
      { date: "2027-10-01", category: "0", status: "pending", payments: [] },
    ],
  };
  const s = summarize([p], "2026-10-01", "2027-10-31");
  assert.equal(s.monthly.length, 13);
  assert.equal(s.monthly[0].month, "2026-10");
  assert.equal(s.monthly[12].month, "2027-10");
  assert.equal(s.monthly[0].requestedPeople, 1);
  assert.equal(s.monthly[0].helpedPeople, 1);
  assert.equal(s.monthly[0].helped, 2);
  assert.equal(s.helpedPeople, 1);
  assert.equal(s.helpedEvents, 2);
});

test("report range validates dates and limits month buckets", () => {
  for (const [from, to] of [
    [null, null],
    ["2026-02-30", "2026-03-01"],
    ["2027-01-01", "2026-01-01"],
    ["2016-01-01", "2026-01-01"],
  ])
    assert.ok(validateReportRange(from, to));
  assert.equal(validateReportRange("2016-01-01", "2025-12-31"), null);
});
test("actual recipients include prior-year requests and repeated payments count once per person", () => {
  const s = summarize(
    [
      {
        village: 1,
        birth: "",
        requests: [
          {
            category: "0",
            date: "2025-01-01",
            status: "done",
            payments: [
              { date: "2026-10-01", amount: 100 },
              { date: "2026-10-31", amount: 200 },
              { date: "2026-11-01", amount: 999 },
            ],
          },
        ],
      },
    ],
    "2026-10-01",
    "2026-10-31",
  );
  assert.equal(s.people, 0);
  assert.equal(s.helpedPeople, 1);
  assert.equal(s.helpedEvents, 2);
  assert.equal(s.amount, 300);
  assert.equal(s.monthly[0].helpedPeople, 1);
});

test("saved request and payment history cannot be dropped during an edit", () => {
  const previous = { requests: [{ id: "r1", payments: [{ id: "p1" }] }] };
  assert.match(validatePersonUpdate({ requests: [] }, previous), /คำขอ/);
  assert.match(
    validatePersonUpdate({ requests: [{ id: "r1", payments: [] }] }, previous),
    /ประวัติ/,
  );
  assert.equal(
    validatePersonUpdate(
      { requests: [{ id: "r1", payments: [{ id: "p1", amount: "200" }] }] },
      previous,
    ),
    null,
  );
});
test("malformed nested records and duplicate payment identities are rejected", () => {
  const p = {
    first: "ทดสอบ",
    last: "ระบบ",
    village: 1,
    disabilities: [],
    requests: [null],
  };
  assert.match(validatePerson(p, defaultConfig), /คำขอ/);
  p.requests = [
    {
      id: "r1",
      category: "0",
      type: "ทดสอบ",
      date: "2026-10-01",
      status: "pending",
      payments: [null],
    },
  ];
  assert.ok(validatePerson(p, defaultConfig));
  const payment = {
    id: "p1",
    date: "2026-10-02",
    provider: "หน่วยงาน",
    detail: "ทดสอบ",
    amount: "100",
    quantity: "",
    unit: "",
  };
  p.requests[0].payments = [payment, { ...payment }];
  assert.match(validatePerson(p, defaultConfig), /ซ้ำ/);
  p.requests[0].payments = [payment];
  assert.equal(validatePerson(p, defaultConfig), null);
});
