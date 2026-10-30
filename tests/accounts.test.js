import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
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
  version: 1,
  password: "temporary-password",
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
  assert.equal(validPassword("a".repeat(12)), true);
});

test("editing an account requires a valid version", () => {
  const a = account();
  delete a.password;
  for (const version of [
    undefined,
    null,
    0,
    -1,
    1.5,
    "1",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.ok(validateAccount({ ...a, version }, defaultConfig, false));
  assert.equal(validateAccount(a, defaultConfig, false), null);
});

test("account migration preserves legacy credentials and defaults new versions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
    db.exec(
      "INSERT INTO users VALUES('legacy','legacy','ชื่อเดิม','original-hash','admin','[]','[]',0,1)",
    );
    db.exec(readFileSync("migrations/0004_account_versions.sql", "utf8"));
    const row = db.prepare("SELECT * FROM users WHERE id='legacy'").get();
    assert.equal(row.version, 1);
    assert.equal(row.password, "original-hash");
    assert.equal(row.must_change, 0);
    assert.equal(row.active, 1);
  } finally {
    db.close();
  }
});
