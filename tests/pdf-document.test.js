import test from "node:test";
import assert from "node:assert/strict";
import { pdfDocument } from "../src/pdf-document.js";
test("PDF preserves ragged report rows, Thai text and formula-like text", () => {
  const document = pdfDocument(
    [
      ["ช่วงวันที่", "2026-10-01", "2027-09-30"],
      ["หมวดหมู่", "จำนวนคน"],
      ["เงินสงเคราะห์", 3],
      [],
      ["=ข้อความ", 3000.3, 1, 2, 3, 4],
    ],
    "รายงาน",
  );
  const table = document.content[0].table;
  assert.equal(document.pageSize, "A4");
  assert.ok(table.body.every((row) => row.length === 3));
  assert.equal(table.body[2][0].text, "เงินสงเคราะห์");
  assert.equal(document.content[1].table.body[0][0].text, "=ข้อความ");
  assert.equal(document.content[1].table.body[0][1].text, "3000.3");
  assert.equal(
    pdfDocument([Array(10).fill("ทะเบียน")], "ทะเบียน").pageSize,
    "A3",
  );
});
