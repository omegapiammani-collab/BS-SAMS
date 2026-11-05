import test from "node:test";
import assert from "node:assert/strict";
import { registryExportRows } from "../src/registry-export.js";
import { childAssistanceType, newChild } from "../src/children.js";
import { age, disabilities } from "../src/domain.js";

const person = {
  id: "internal-registry-id",
  title: "นาย",
  first: "ทดสอบ",
  last: "ส่งออก",
  nationalId: "",
  birth: "1990-01-01",
  house: "001/2",
  village: 1,
  phone: "",
  requests: [
    { category: "0", type: childAssistanceType, status: "done" },
    { category: "1", type: "เงินซ่อมแซมบ้านผู้สูงอายุ", status: "pending" },
    { category: "0", type: childAssistanceType, status: "done" },
  ],
};

test("registry exports hide registry IDs and status and uses Buddhist birth dates", () => {
  const rows = registryExportRows([person]);
  assert.ok(!JSON.stringify(rows).includes(person.id));
  assert.ok(!rows[0].includes("เลขทะเบียน"));
  assert.ok(!rows[0].includes("สถานะ"));
  assert.equal(rows[1][4], "01/01/2533");
  assert.equal(rows[1][9], "เงินสงเคราะห์\nเงินซ่อมบ้าน");
  assert.equal(rows[0][9], "หมวดหมู่");
  assert.equal(rows[0][10], "ประเภทความช่วยเหลือ");
  assert.equal(
    rows[1][10],
    childAssistanceType + "\nเงินซ่อมแซมบ้านผู้สูงอายุ",
  );
  assert.equal(rows[1][rows[0].indexOf("บ้านเลขที่")], "001/2");
  assert.ok(rows.every((row) => row.length === rows[0].length));
});

test("registry exports show only the selected assistance category including category zero", () => {
  assert.equal(
    registryExportRows([person], { cat: "0" })[1][9],
    "เงินสงเคราะห์",
  );
  assert.equal(
    registryExportRows([person], { cat: "1" })[1][9],
    "เงินซ่อมบ้าน",
  );
  assert.equal(
    registryExportRows([person], { cat: "0" })[1][10],
    childAssistanceType,
  );
  assert.equal(
    registryExportRows([person], { cat: "1" })[1][10],
    "เงินซ่อมแซมบ้านผู้สูงอายุ",
  );
  assert.equal(
    registryExportRows([person], { cat: "" })[1][9],
    "เงินสงเคราะห์\nเงินซ่อมบ้าน",
  );
  assert.equal(
    registryExportRows([{ ...person, birth: "", requests: [] }])[1][4],
    "",
  );
});

test("missing house numbers remain blank in legacy records", () => {
  const rows = registryExportRows([{ ...person, house: undefined }]);
  assert.equal(rows[1][rows[0].indexOf("บ้านเลขที่")], "");
});

test("registry exports include child identity and assistance type without removed columns", () => {
  const child = {
    ...newChild(),
    first: "เด็กจำลอง",
    last: "ทดสอบ",
    birth: "2020-01-01",
    nationalId: "1101700207030",
    disabilities: [disabilities[0]],
  };
  const parent = {
    ...person,
    requests: [
      {
        category: "0",
        type: childAssistanceType,
        date: "2026-01-01",
        children: [child, { ...newChild(), first: "เด็กสอง", last: "ทดสอบ" }],
      },
    ],
  };
  const rows = registryExportRows([parent]);
  const value = (row, header) => rows[row][rows[0].indexOf(header)];
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.length === rows[0].length));
  assert.equal(value(1, "ประเภทข้อมูล"), "ผู้ยื่นคำขอ");
  assert.equal(value(2, "ประเภทข้อมูล"), "บุตรหรือเด็กในความอุปการะ");
  assert.equal(value(2, "ชื่อ"), child.first);
  assert.equal(value(2, "คำนำหน้า"), child.title);
  assert.equal(value(2, "เลขบัตรประชาชน"), child.nationalId);
  assert.equal(value(2, "วันเดือนปีเกิด"), "01/01/2563");
  assert.equal(value(2, "อายุ"), age(child.birth));
  assert.ok(!rows[0].includes("ความพิการ"));
  assert.ok(!rows[0].includes("ผู้ยื่นคำขอและคำขอ"));
  assert.equal(value(2, "ประเภทความช่วยเหลือ"), childAssistanceType);
  assert.equal(value(1, "หมวดหมู่"), "เงินสงเคราะห์");
  assert.equal(value(2, "หมวดหมู่"), "เงินสงเคราะห์");
  assert.equal(value(1, "ประเภทความช่วยเหลือ"), childAssistanceType);
  assert.equal(value(2, "โทรศัพท์"), "");
  assert.equal(value(2, "บ้านเลขที่"), "");
  assert.equal(value(3, "อายุ"), null);
  assert.equal(registryExportRows([parent], { cat: "1" }).length, 2);
  assert.equal(registryExportRows([parent], { cat: "0" }).length, 4);
  assert.ok(!JSON.stringify(rows).includes(child.id));
});
