import test from "node:test";
import assert from "node:assert/strict";
import {
  childAssistanceType,
  newChild,
  removedChildren,
} from "../src/children.js";
import {
  defaultConfig,
  disabilities,
  validatePersonIssue,
} from "../src/domain.js";
import { validateDraftData } from "../server/drafts.js";
import { personExport } from "../src/person-export.js";

const fixture = () => ({
  first: "ผู้ปกครอง",
  last: "ทดสอบ",
  village: 1,
  disabilities: [],
  requests: [
    {
      id: "request",
      category: "0",
      type: childAssistanceType,
      date: "2026-01-01",
      status: "pending",
      payments: [],
      children: [
        {
          ...newChild(),
          first: "เด็กหนึ่ง",
          last: "ทดสอบ",
          birth: "2020-01-01",
          disabilities: [disabilities[0]],
        },
        { ...newChild(), first: "เด็กสอง", last: "ทดสอบ" },
      ],
    },
  ],
});
test("children validate individually and remain optional on legacy requests", () => {
  const person = fixture();
  assert.equal(validatePersonIssue(person, defaultConfig), null);
  delete person.requests[0].children;
  assert.equal(validatePersonIssue(person, defaultConfig), null);
  assert.equal(validateDraftData(person), true);
});
test("child validation identifies the exact nested field and rejects malformed records", () => {
  for (const [key, value] of [
    ["first", ""],
    ["nationalId", "1234567890123"],
    ["birth", "2999-01-01"],
    ["birth", "2025-02-30"],
    ["disabilities", ["unknown"]],
  ]) {
    const person = fixture();
    const child = person.requests[0].children[1];
    child[key] = value;
    assert.equal(
      validatePersonIssue(person, defaultConfig).field,
      `requests.request.children.${child.id}.${key}`,
    );
  }
  for (const children of [
    null,
    {},
    [null],
    [{ ...newChild(), phone: "0123456789" }],
    [{ ...newChild(), marital: "โสด" }],
    [newChild(), { ...newChild(), disabilities: "bad" }],
  ]) {
    const person = fixture();
    person.requests[0].children = children;
    assert.ok(validatePersonIssue(person, defaultConfig));
    assert.equal(validateDraftData(person), false);
  }
  const person = fixture();
  person.requests[0].children.push(person.requests[0].children[0]);
  assert.equal(validateDraftData(person), false);
  assert.ok(validatePersonIssue(person, defaultConfig));
});
test("drafts retain incomplete child fields and PDF includes each child under its request", () => {
  const person = fixture();
  person.requests[0].children.push(newChild());
  assert.equal(validateDraftData(person), true);
  person.requests[0].children.pop();
  const text = JSON.stringify(personExport(person, defaultConfig));
  for (const value of [
    "เด็กหนึ่ง",
    "เด็กสอง",
    "01/01/2563",
    disabilities[0],
    "คนที่ 2 ของคำขอที่ 1",
  ])
    assert.ok(text.includes(value));
});
test("child removal detection covers individual removal and whole request deletion", () => {
  const previous = fixture();
  const next = structuredClone(previous);
  const removed = next.requests[0].children.pop();
  assert.deepEqual(removedChildren(next, previous), [removed.id]);
  assert.deepEqual(
    removedChildren({ requests: [] }, previous),
    previous.requests[0].children.map((child) => child.id),
  );
  assert.deepEqual(removedChildren(previous, previous), []);
});
