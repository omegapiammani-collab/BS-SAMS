import test from "node:test";
import assert from "node:assert/strict";
import { pdfDocument } from "../src/pdf-document.js";
const visibleText = (text) =>
  Array.isArray(text) ? text.map((run) => run.text).join("") : text;
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
  assert.equal(visibleText(table.body[2][0].text), "เงินสงเคราะห์");
  assert.equal(
    visibleText(document.content[1].table.body[0][0].text),
    "=ข้อความ",
  );
  assert.equal(document.content[1].table.body[0][1].text, "3000.3");
  assert.equal(
    pdfDocument([Array(10).fill("ทะเบียน")], "ทะเบียน").pageSize,
    "A3",
  );
});

test("PDF date subtitles appear above the table without changing column layout", () => {
  const doc = pdfDocument(
    [
      ["คำนำหน้า", "ชื่อ"],
      ["นาย", "ทดสอบ"],
    ],
    "ทะเบียน",
    {
      subtitles: [
        "วันที่ยื่นคำขอ · ตั้งแต่วันที่ 01/10/2569",
        "วันที่ได้รับการช่วยเหลือ · ถึงวันที่ 30/11/2569",
      ],
    },
  );
  assert.equal(
    doc.content[0].text.replace(/ํา/g, "ำ"),
    "วันที่ยื่นคำขอ · ตั้งแต่วันที่ 01/10/2569",
  );
  assert.equal(
    doc.content[1].text.replace(/ํา/g, "ำ"),
    "วันที่ได้รับการช่วยเหลือ · ถึงวันที่ 30/11/2569",
  );
  assert.equal(doc.content[2].table.headerRows, 1);
  assert.equal(doc.content[2].table.body.length, 2);
});
