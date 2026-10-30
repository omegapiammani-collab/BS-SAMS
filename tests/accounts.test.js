import test from "node:test";
import assert from "node:assert/strict";
import { validateAccount, validPassword } from "../server/accounts.js";
import { defaultConfig } from "../src/domain.js";
const account = () => ({
  username: "staff01",
  name: "เจ้าหน้าที่",
  role: "staff",
  permissions: ["view", "edit"],
  villages: [1],
  active: true,
  password: "Temporary-password1!",
});
test("account validation rejects malformed values and unknown assignments", () => {
  for (const bad of [
    null,
    { ...account(), name: 7 },
    { ...account(), active: "yes" },
    { ...account(), permissions: ["root"] },
    { ...account(), permissions: ["view", "view"] },
    { ...account(), villages: [999] },
    { ...account(), villages: [1, 1] },
  ])
    assert.ok(validateAccount(bad, defaultConfig, true));
  assert.equal(validateAccount(account(), defaultConfig, true), null);
});
test("staff operations require view permission and village assignment", () => {
  assert.match(
    validateAccount(
      { ...account(), permissions: ["edit"] },
      defaultConfig,
      true,
    ),
    /ดูข้อมูล/,
  );
  assert.match(
    validateAccount({ ...account(), villages: [] }, defaultConfig, true),
    /หมู่บ้าน/,
  );
  assert.equal(
    validateAccount(
      { ...account(), permissions: [], villages: [] },
      defaultConfig,
      true,
    ),
    null,
  );
});
test("password resets are separate from account edits", () => {
  assert.ok(validateAccount(account(), defaultConfig, false));
  const a = account();
  delete a.password;
  assert.equal(validateAccount(a, defaultConfig, false), null);
  for (const p of [null, {}, 123, "short", "a".repeat(129)])
    assert.equal(validPassword(p), false);
  assert.equal(validPassword("Abcde1!x"), true);
  for (const p of [
    "Abcd1!x",
    "abcdef1!x",
    "ABCDEF1!X",
    "Abcdefg!x",
    "Abcdef12x",
    "Abcdef12 ",
  ])
    assert.equal(validPassword(p), false);
});

test("password symbols must be punctuation or symbols, not other alphabet letters", () => {
  for (const value of ["Abcdefg1ก", "Abcdefg1é", "Abcdefg1中"])
    assert.equal(validPassword(value), false);
  for (const value of [
    "Abcdefg1!",
    "Abcdefg1@",
    "Abcdefg1€",
    "Abcdefg1_",
    "Abcdefg1-",
  ])
    assert.equal(validPassword(value), true);
});
