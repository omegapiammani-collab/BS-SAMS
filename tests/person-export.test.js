import test from "node:test";
import assert from "node:assert/strict";
import { personExport } from "../src/person-export.js";
import { pdfDocument } from "../src/pdf-document.js";
test("individual PDF contains identity, every request and assistance, and Thai dates", () => {
  const person = {
    id: "p1",
    title: "นาย",
    first: "ทดสอบ",
    last: "รายบุคคล",
    birth: "1990-01-01",
    nationalId: "",
    disabilities: [],
    village: 1,
    requests: [
      {
        id: "r1",
        category: "0",
        type: "คำขอแรก",
        date: "2026-10-30",
        status: "done",
        payments: [
          {
            date: "2026-10-31",
            provider: "หน่วยงานทดสอบ",
            amount: "3000.30",
            detail: "รายละเอียดทดสอบ",
          },
        ],
      },
      {
        id: "r2",
        category: "1",
        type: "คำขอที่สอง",
        date: "2026-10-31",
        status: "pending",
        payments: [],
      },
    ],
  };
  const rows = personExport(person, { villages: [{ id: 1, name: "ทดสอบ" }] });
  const text = JSON.stringify(rows);
  assert.ok(!text.includes("เลขทะเบียน"));
  assert.ok(!rows.some((row) => row.includes(person.id)));
  for (const value of [
    "นายทดสอบ รายบุคคล",
    "01/01/2533",
    "30/10/2569",
    "31/10/2569",
    "หน่วยงานทดสอบ",
    "3,000.30",
    "รายละเอียดทดสอบ",
    "คำขอแรก",
    "คำขอที่สอง",
    "ยังไม่มีการช่วยเหลือ",
  ])
    assert.ok(text.includes(value));
  const document = pdfDocument(rows, "รายละเอียดผู้ประสบปัญหา", {
    orientation: "portrait",
  });
  assert.equal(document.pageSize, "A4");
  assert.equal(document.pageOrientation, "portrait");
  assert.ok(
    document.content.every(
      (section) => section.table.widths.reduce((a, b) => a + b, 0) < 595,
    ),
  );
});

test("missing individual PDF fields remain blank while real values are retained", () => {
  const person = {
    first: "ทดสอบ",
    last: "ข้อมูลว่าง",
    village: 1,
    disabilities: [],
    requests: [
      {
        id: "r1",
        category: "0",
        type: "สงเคราะห์",
        date: "2026-10-01",
        status: "done",
        payments: [
          {
            date: "2026-10-02",
            provider: "หน่วยงาน",
            amount: 0,
            detail: "ไม่ระบุ",
          },
        ],
      },
    ],
  };
  const rows = personExport(person, { villages: [] });
  const value = (label) => rows.find((row) => row[0] === label)?.[1];
  for (const label of [
    "เลขบัตรประชาชน",
    "วันเกิด",
    "อายุ",
    "สถานภาพสมรส",
    "ยื่นคำร้องผ่านระบบ",
    "โทรศัพท์",
    "รหัสประจำบ้าน",
    "บ้านเลขที่",
    "สภาพปัญหาและรายละเอียดคำขอ",
    "จำนวนสิ่งของ",
  ])
    assert.equal(value(label), "", label);
  assert.equal(value("จำนวนเงิน (บาท)"), "0.00");
  assert.equal(value("รายละเอียดความช่วยเหลือ"), "ไม่ระบุ");
  assert.equal(value("ความพิการ"), "ไม่มีความพิการ");
  person.requests[0].payments[0].quantity = 0;
  const withZero = personExport(person, { villages: [] });
  assert.equal(withZero.find((row) => row[0] === "จำนวนสิ่งของ")[1], "0");
});
