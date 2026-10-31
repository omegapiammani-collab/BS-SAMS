import test from "node:test";
import assert from "node:assert/strict";
import { duplicateReasons } from "../src/duplicate-person.js";
test("similar names need corroboration while exact names warn without national ID", () => {
  const p = {
    first: "สมชาย",
    last: "ใจดี",
    birth: "1965-01-01",
    phone: "0812345678",
  };
  assert.ok(duplicateReasons(p, { ...p, first: " สมชาย " }).length);
  assert.ok(duplicateReasons(p, { ...p, first: "สมชาน" }).length);
  assert.equal(
    duplicateReasons(p, {
      ...p,
      first: "สมชาน",
      birth: "1966-01-01",
      phone: "",
    }).length,
    0,
  );
  assert.equal(
    duplicateReasons(p, { first: "คนอื่น", last: "คนละคน", phone: p.phone })
      .length,
    0,
  );
  assert.ok(
    duplicateReasons(
      { ...p, birth: "", phone: "" },
      { first: p.first, last: p.last },
    ).length,
  );
});
