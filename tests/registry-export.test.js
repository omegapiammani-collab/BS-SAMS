import test from "node:test";
import assert from "node:assert/strict";
import { registryExportRows } from "../src/registry-export.js";

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
    { category: "0", status: "done" },
    { category: "1", status: "pending" },
    { category: "0", status: "done" },
  ],
};

test("registry exports hide registry IDs and status and uses Buddhist birth dates", () => {
  const rows = registryExportRows([person]);
  assert.ok(!JSON.stringify(rows).includes(person.id));
  assert.ok(!rows[0].includes("เลขทะเบียน"));
  assert.ok(!rows[0].includes("สถานะ"));
  assert.equal(rows[1][4], "01/01/2533");
  assert.equal(rows[1][9], "เงินสงเคราะห์\nเงินซ่อมบ้าน");
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
