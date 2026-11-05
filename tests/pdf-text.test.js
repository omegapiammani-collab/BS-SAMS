import test from "node:test";
import assert from "node:assert/strict";
import { pdfText } from "../src/pdf-text.js";
const visibleText = (text) =>
  Array.isArray(text) ? text.map((run) => run.text).join("") : text;

test("PDF Thai line breaks preserve whole words and all original characters", () => {
  const text = "เงินสงเคราะห์ผู้สูงอายุที่อยู่ในภาวะยากลำบาก";
  const formatted = pdfText(text, { thaiWordWrap: true });
  assert.equal(visibleText(formatted), text);
  assert.ok(formatted.some((run) => run.text === "ลำบาก" && run.noWrap));
  assert.ok(!formatted.some((run) => run.text === "ลำ" || run.text === "ล"));
  assert.ok(formatted.every((run) => !run.text.includes("\u200b")));
});

test("PDF word wrapping preserves dates, numbers, spaces, explicit newlines and registry-only breaks", () => {
  for (const value of [
    "01/10/2568",
    "2025-10-01",
    "1101700207030",
    "=SUM(A1)",
    12,
    null,
  ])
    assert.equal(pdfText(value), String(value ?? ""));
  const text = "เงินสงเคราะห์เด็กในครอบครัวยากจน";
  assert.ok(!visibleText(pdfText(text, { thaiWordWrap: true })).includes("\n"));
  assert.equal(
    visibleText(
      pdfText(text, { wrapChildAssistance: true, thaiWordWrap: true }),
    ),
    "เงินสงเคราะห์เด็กในครอบครัว\nยากจน",
  );
  const mixed = "พม. CARE\nสายด่วน พม. 1300";
  assert.equal(visibleText(pdfText(mixed, { thaiWordWrap: true })), mixed);
});
