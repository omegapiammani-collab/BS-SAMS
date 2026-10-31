import test from "node:test";
import assert from "node:assert/strict";
import { registryPdfRows } from "../src/registry-export.js";

const person = {
  id: "internal-registry-id",
  title: "นาย",
  first: "ทดสอบ",
  last: "ส่งออก",
  nationalId: "",
  birth: "1990-01-01",
  village: 1,
  phone: "",
  requests: [
    { category: "0", status: "done" },
    { category: "1", status: "pending" },
    { category: "0", status: "done" },
  ],
};

test("registry PDF hides registry IDs and status and uses Buddhist birth dates", () => {
  const rows = registryPdfRows([person]);
  assert.ok(!JSON.stringify(rows).includes(person.id));
  assert.ok(!rows[0].includes("เลขทะเบียน"));
  assert.ok(!rows[0].includes("สถานะ"));
  assert.equal(rows[1][4], "01/01/2533");
  assert.equal(rows[1][8], "เงินสงเคราะห์\nเงินซ่อมบ้าน");
  assert.ok(rows.every((row) => row.length === rows[0].length));
});

test("registry PDF shows only the selected assistance category including category zero", () => {
  assert.equal(registryPdfRows([person], { cat: "0" })[1][8], "เงินสงเคราะห์");
  assert.equal(registryPdfRows([person], { cat: "1" })[1][8], "เงินซ่อมบ้าน");
  assert.equal(
    registryPdfRows([person], { cat: "" })[1][8],
    "เงินสงเคราะห์\nเงินซ่อมบ้าน",
  );
  assert.equal(
    registryPdfRows([{ ...person, birth: "", requests: [] }])[1][4],
    "",
  );
});
