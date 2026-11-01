import test from "node:test";
import assert from "node:assert/strict";
import {
  generateTemporaryPassword,
  validPassword,
} from "../src/password-policy.js";

test("temporary passwords are exactly eight characters and meet the password policy", () => {
  for (let i = 0; i < 1000; i++) {
    const password = generateTemporaryPassword();
    assert.equal(password.length, 8);
    assert.ok(validPassword(password));
    assert.match(password, /^[A-Za-z2-9!@#$%&*?]{8}$/);
  }
});
