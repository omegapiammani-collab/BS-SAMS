import test from "node:test";
import assert from "node:assert/strict";
import {
  age,
  validNationalId,
  fiscalRange,
  personStatus,
  summarize,
  validateReportRange,
  validatePerson,
  validatePersonIssue,
  validatePersonUpdate,
  removedPersonRecords,
  defaultConfig,
  completeAssistedRequests,
} from "../src/domain.js";
import { allowed, hashPassword, verifyPassword } from "../server/auth.js";
test("saving new assistance completes only the affected request", () => {
  const previous = {
    requests: [
      { id: "a", status: "progress", payments: [] },
      { id: "b", status: "pending", payments: [] },
      { id: "c", status: "cancelled", payments: [{ id: "saved" }] },
    ],
  };
  const person = structuredClone(previous);
  person.requests[0].payments.push({ id: "new" });
  const result = completeAssistedRequests(person, previous);
  assert.deepEqual(
    result.map((request) => request.status),
    ["done", "pending", "cancelled"],
  );
  assert.equal(person.requests[0].status, "progress");
  assert.equal(completeAssistedRequests(person)[0].status, "done");
  assert.equal(
    completeAssistedRequests(previous, previous)[0].status,
    "progress",
  );
});
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
test("closed request reasons are optional and completion needs assistance", () => {
  const p = {
    first: "ตัวอย่าง",
    last: "ทดสอบ",
    village: 1,
    disabilities: [],
    requests: [
      {
        id: "optional-reason-request",
        category: "0",
        type: "สงเคราะห์",
        date: "2026-10-01",
        status: "rejected",
        payments: [],
      },
    ],
  };
  assert.equal(validatePerson(p, defaultConfig), null);
  p.requests[0].status = "cancelled";
  assert.equal(validatePerson(p, defaultConfig), null);
  p.requests[0].status = "referred";
  assert.match(validatePerson(p, defaultConfig), /สถานะ/);
  assert.equal(
    validatePerson(p, defaultConfig, undefined, structuredClone(p)),
    null,
  );
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

test("request and payment deletion is allowed while category locking remains", () => {
  const previous = { requests: [{ id: "r1", payments: [{ id: "p1" }] }] };
  assert.equal(validatePersonUpdate({ requests: [] }, previous), null);
  assert.equal(
    validatePersonUpdate({ requests: [{ id: "r1", payments: [] }] }, previous),
    null,
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
  p.requests[0].payments[0].detail = "";
  assert.equal(validatePerson(p, defaultConfig), null);
});

test("saved request categories are immutable while separate new requests are allowed", () => {
  const request = { id: "r1", category: "0", payments: [] };
  const previous = { requests: [request] };
  assert.match(
    validatePersonUpdate(
      { requests: [{ ...request, category: "1" }] },
      previous,
    ),
    /หมวดหมู่/,
  );
  assert.equal(
    validatePersonUpdate(
      { requests: [request, { id: "r2", category: "1", payments: [] }] },
      previous,
    ),
    null,
  );
});

test("one assistance event per request preserves legacy history without allowing additions", () => {
  const payment = {
    id: "pay1",
    date: "2026-10-30",
    provider: "หน่วยงาน",
    detail: "",
    amount: "100",
    quantity: "",
    unit: "",
  };
  const previous = {
    first: "ทดสอบ",
    last: "ระบบ",
    village: 1,
    disabilities: [],
    requests: [
      {
        id: "req1",
        category: "0",
        type: "ทดสอบ",
        date: "2026-10-30",
        status: "done",
        payments: [payment, { ...payment, id: "pay2" }],
      },
    ],
  };
  assert.match(
    validatePerson(previous, defaultConfig, "2026-10-31"),
    /หนึ่งครั้ง/,
  );
  assert.equal(
    validatePerson(
      structuredClone(previous),
      defaultConfig,
      "2026-10-31",
      previous,
    ),
    null,
  );
  const extra = structuredClone(previous);
  extra.requests[0].payments.push({ ...payment, id: "pay3" });
  assert.match(
    validatePerson(extra, defaultConfig, "2026-10-31", previous),
    /หนึ่งครั้ง/,
  );
  const replaced = structuredClone(previous);
  replaced.requests[0].payments[1].id = "new-id";
  assert.match(
    validatePerson(replaced, defaultConfig, "2026-10-31", previous),
    /หนึ่งครั้ง/,
  );
  const single = structuredClone(previous);
  single.requests[0].payments = [payment];
  assert.equal(validatePerson(single, defaultConfig, "2026-10-31"), null);
  assert.equal(validatePersonUpdate(single, previous), null);
});

test("deletion tracking includes assistance within a removed request", () => {
  const old = {
    requests: [
      { id: "r1", payments: [{ id: "p1" }] },
      { id: "r2", payments: [{ id: "p2" }] },
    ],
  };
  assert.deepEqual(
    removedPersonRecords({ requests: [{ id: "r2", payments: [] }] }, old),
    { requests: ["r1"], payments: ["p1", "p2"] },
  );
});

// Synthetic checksum-valid value, not a fixture from a real person's record.
test("national ID requires exactly 13 ASCII digits and a valid check digit", () => {
  assert.equal(validNationalId("1234567890121"), true);
  for (const value of [
    "123456789012",
    "12345678901210",
    "1234567890122",
    "123456789012A",
    "๑๒๓๔๕๖๗๘๙๐๑๒๑",
    1234567890121,
    null,
  ])
    assert.equal(validNationalId(value), false);
});

test("person validation identifies fields across hidden requests and assistance", () => {
  const person = {
    first: "ทดสอบ",
    last: "ระบบ",
    village: 1,
    disabilities: [],
    requests: [],
  };
  assert.equal(
    validatePersonIssue(
      { ...person, nationalId: "1234567890122" },
      defaultConfig,
    ).field,
    "nationalId",
  );
  const request = {
    id: "request-a",
    category: "0",
    type: "",
    date: "2026-10-01",
    status: "pending",
    payments: [],
  };
  const invalidRequest = { ...person, requests: [request] };
  const issue = validatePersonIssue(
    invalidRequest,
    defaultConfig,
    "2026-10-31",
  );
  assert.equal(issue.field, "requests.request-a.type");
  assert.equal(
    issue.message,
    validatePerson(invalidRequest, defaultConfig, "2026-10-31"),
  );
  request.type = "เงินสงเคราะห์";
  request.payments = [
    {
      id: "payment-a",
      date: "2026-10-02",
      provider: "หน่วยงานทดสอบ",
      amount: 100,
      quantity: 1,
      unit: "",
      detail: "",
    },
  ];
  assert.equal(
    validatePersonIssue(invalidRequest, defaultConfig, "2026-10-31").field,
    "requests.request-a.payments.payment-a.unit",
  );
  request.payments[0].unit = "ชิ้น";
  assert.equal(
    validatePersonIssue(invalidRequest, defaultConfig, "2026-10-31"),
    null,
  );
});
