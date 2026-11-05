import test from "node:test";
import assert from "node:assert/strict";
import {
  submissionChannels,
  validatePerson,
  defaultConfig,
} from "../src/domain.js";
import { validateDraftData } from "../server/drafts.js";
import { personExport } from "../src/person-export.js";
import { registryExportRows } from "../src/registry-export.js";
const person = {
  first: "ทดสอบ",
  last: "ช่องทาง",
  village: 1,
  disabilities: [],
  requests: [],
};

test("submission channels accept old records, no selection, either or both choices", () => {
  for (const selection of [
    undefined,
    [],
    [submissionChannels[0]],
    [submissionChannels[1]],
    submissionChannels,
  ]) {
    const p = { ...person, submissionChannels: selection };
    assert.equal(validatePerson(p, defaultConfig), null);
    assert.equal(validateDraftData(p), true);
    const text = selection?.join("\n") || "";
    assert.deepEqual(
      personExport(p, defaultConfig).find((r) => r[0] === "ยื่นคำร้องผ่านระบบ"),
      ["ยื่นคำร้องผ่านระบบ", text],
    );
    const rows = registryExportRows([p]);
    assert.equal(rows[1][rows[0].indexOf("ยื่นคำร้องผ่านระบบ")], text);
  }
});

test("API and draft validation reject malformed or duplicated submission channels", () => {
  for (const submissionChannels of [
    null,
    "พม. CARE",
    {},
    ["unknown"],
    ["พม. CARE", "พม. CARE"],
    [1],
  ]) {
    const p = { ...person, submissionChannels };
    assert.match(validatePerson(p, defaultConfig), /ช่องทาง/);
    assert.equal(validateDraftData(p), false);
  }
});
