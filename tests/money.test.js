import test from "node:test";
import assert from "node:assert/strict";
import { summarize, validatePerson, defaultConfig } from "../src/domain.js";
import { toSatang, validMoney, sumMoney, thailandDate } from "../src/money.js";
test("currency totals sum integer satang rather than binary fractions", () => {
  assert.equal(sumMoney([{ amount: "0.10" }, { amount: "0.20" }]), 0.3);
  const s = summarize(
    [
      {
        village: 1,
        requests: [
          {
            date: "2026-10-01",
            status: "done",
            category: "0",
            payments: [
              { date: "2026-10-02", amount: 0.1 },
              { date: "2026-10-03", amount: 0.2 },
            ],
          },
        ],
      },
    ],
    "2026-10-01",
    "2026-10-31",
  );
  assert.equal(s.amount, 0.3);
  assert.equal(s.monthly[0].amount, 0.3);
});
test("amount precision and Thailand calendar boundaries are explicit", () => {
  for (const x of ["1.001", -1, Infinity, true, {}, "not money", "1000000000"])
    assert.equal(validMoney(x), false);
  for (const x of ["", 0, "0.10", "12.34", "1e3"])
    assert.equal(validMoney(x), true);
  assert.equal(toSatang("12.34"), 1234);
  assert.equal(thailandDate(new Date("2026-10-29T17:00:00Z")), "2026-10-30");
});

test("assistance validation enforces dates, currency precision and item units", () => {
  const person = {
    first: "ทดสอบ",
    last: "ระบบ",
    village: 1,
    birth: "1990-01-01",
    disabilities: [],
    requests: [
      {
        id: "r1",
        date: "2026-10-01",
        category: "0",
        type: "สงเคราะห์",
        status: "done",
        payments: [
          {
            id: "p1",
            date: "2026-10-02",
            provider: "อบต.",
            detail: "ทดสอบ",
            amount: "0.10",
            quantity: "",
            unit: "",
          },
        ],
      },
    ],
  };
  const check = (p) => validatePerson(p, defaultConfig, "2026-10-30");
  const alter = (fields) => ({
    ...person,
    requests: [
      {
        ...person.requests[0],
        payments: [{ ...person.requests[0].payments[0], ...fields }],
      },
    ],
  });
  assert.equal(check(person), null);
  assert.match(check(alter({ amount: "1.001" })), /ทศนิยม/);
  assert.match(check(alter({ date: "2026-10-31" })), /อนาคต/);
  assert.ok(check(alter({ date: "2026-09-30" })));
  assert.ok(check(alter({ amount: "", quantity: true, unit: "คัน" })));
  assert.ok(check(alter({ amount: "", quantity: "1", unit: "" })));
  assert.equal(
    check(alter({ amount: "", quantity: "2.5", unit: "กิโลกรัม" })),
    null,
  );
  assert.match(
    check({
      ...person,
      requests: [{ ...person.requests[0], date: "1989-01-01" }],
    }),
    /วันเกิด/,
  );
  assert.match(
    check({
      ...person,
      requests: [{ ...person.requests[0], date: "2026-10-31" }],
    }),
    /อนาคต/,
  );
});
