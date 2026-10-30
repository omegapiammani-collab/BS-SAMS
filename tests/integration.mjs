import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { hashPassword } from "../server/auth.js";
const origin = "http://127.0.0.1:8787",
  pass = crypto.randomUUID(),
  nextPass = crypto.randomUUID(),
  staffPass = crypto.randomUUID();
const env = {
  ...process.env,
  XDG_CONFIG_HOME: "/workspace/BS-SAMS/.wrangler/config",
  WRANGLER_LOG_PATH: "/tmp/bs-sams-test.log",
};
function sql(s) {
  const file = "/tmp/bs-sams-qa.sql";
  writeFileSync(file, s, { mode: 0o600 });
  try {
    execFileSync(
      "node_modules/.bin/wrangler",
      ["d1", "execute", "bs-sams", "--local", "--file", file],
      { env, stdio: "pipe" },
    );
  } finally {
    unlinkSync(file);
  }
}
const adminId = "qa-" + crypto.randomUUID();
sql(
  `INSERT INTO users VALUES('${adminId}','qa-admin','ผู้ดูแลทดสอบ','${await hashPassword(pass)}','admin','[]','[]',1,1);`,
);
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1536, height: 1024 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let staffId, personId;
async function call(path, method = "GET", data) {
  const response = await context.request.fetch(origin + "/api" + path, {
    method,
    data,
    headers: data ? { "Content-Type": "application/json" } : {},
  });
  return { status: response.status(), data: await response.json() };
}
try {
  await page.goto(origin);
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("qa-admin");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.getByLabel("รหัสผ่านปัจจุบัน").fill(pass);
  await page.getByLabel("รหัสผ่านใหม่ อย่างน้อย").fill(nextPass);
  await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(nextPass);
  await page.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("qa-admin");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(nextPass);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.getByRole("heading", { name: "ภาพรวมการช่วยเหลือ" }).waitFor();
  assert.equal((await call("/people")).status, 200);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
    .click();
  await page
    .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
    .click();
  await page.getByLabel("ชื่อ *", { exact: true }).fill("บุคคลทดสอบ");
  await page.getByLabel("นามสกุล *", { exact: true }).fill("ระบบ");
  await page.getByLabel("วันเดือนปีเกิด").fill("1990-01-01");
  await page.getByRole("button", { name: "เพิ่มคำขอ", exact: true }).click();
  await page
    .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
    .fill("เงินสงเคราะห์ทดสอบ");
  await page
    .getByRole("button", { name: "บันทึกการช่วยเหลือ", exact: true })
    .click();
  await page.getByLabel("หน่วยงานผู้ให้ *").fill("หน่วยงานทดสอบ");
  await page.getByLabel("จำนวนเงิน · บาท").fill("3000");
  await page
    .getByLabel("รายละเอียดความช่วยเหลือ *")
    .fill("ข้อมูลจำลองสำหรับทดสอบ จะลบหลังทดสอบ");
  await page.getByLabel("สถานะ", { exact: true }).selectOption("done");
  await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("บุคคลทดสอบ ระบบ", { exact: false }).first().waitFor();
  const people = (await call("/people")).data;
  const p = people.find((p) => p.first === "บุคคลทดสอบ");
  personId = p.id;
  assert.equal(p.requests[0].payments[0].amount, "3000");
  const stale = await call("/people/" + p.id, "PUT", { ...p, version: 0 });
  assert.equal(stale.status, 409);
  const exportResponse = await call("/export", "POST", { ids: [p.id] });
  assert.equal(exportResponse.data.length, 1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const dl = await download;
  assert.ok(dl.suggestedFilename().endsWith(".xlsx"));
  await dl.saveAs("/tmp/bs-sams-qa.xlsx");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile("/tmp/bs-sams-qa.xlsx");
  assert.equal(book.worksheets[0].rowCount, 2);
  assert.equal(book.worksheets[0].getRow(2).getCell(3).value, "บุคคลทดสอบ");
  await page
    .getByLabel("ชื่อ นามสกุล / เลขบัตร / เลขทะเบียน")
    .fill("ไม่พบข้อมูลนี้");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await page.getByRole("heading", { name: "ไม่พบข้อมูลตามเงื่อนไข" }).waitFor();
  await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
  await page.screenshot({ path: "/tmp/bs-sams-registry.png", fullPage: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ภาพรวม", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "ผู้ประสบปัญหารายหมู่บ้าน", exact: true })
    .waitFor();
  await page.screenshot({ path: "/tmp/bs-sams-dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: "/tmp/bs-sams-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "เปิดเมนู" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "รายงานและส่งออก" })
    .click();
  await page
    .getByRole("heading", { name: "จำนวนผู้ประสบปัญหาตามประเภทความช่วยเหลือ" })
    .waitFor();
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ตั้งค่าระบบ" })
    .click();
  await page.getByLabel("ชื่อระบบ", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "บันทึกการตั้งค่า", exact: true })
    .click();
  await page
    .getByText("บันทึกการตั้งค่าเรียบร้อยแล้ว", { exact: true })
    .waitFor();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "จัดการผู้ใช้งาน" })
    .click();
  await page
    .getByRole("button", { name: "เพิ่มผู้ใช้งาน", exact: true })
    .click();
  await page.getByLabel("ชื่อผู้ใช้ · a–z, 0–9, จุด, ขีด").waitFor();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  assert.equal(
    (await call("/people/" + p.id, "DELETE", { reason: "ทดสอบถังขยะ" })).status,
    200,
  );
  assert.ok((await call("/people?trash=1")).data.some((x) => x.id === p.id));
  assert.equal(
    (await call("/people/" + p.id + "/restore", "POST", {})).status,
    200,
  );
  await call("/users", "POST", {
    username: "qa-staff",
    name: "เจ้าหน้าที่ทดสอบ",
    password: staffPass,
    role: "staff",
    permissions: ["view", "edit", "export"],
    villages: [2],
  });
  staffId = (await call("/users")).data.find(
    (x) => x.username === "qa-staff",
  ).id;
  const staffContext = await browser.newContext();
  async function staffCall(path, method = "GET", data) {
    const r = await staffContext.request.fetch(origin + "/api" + path, {
      method,
      data,
      headers: data ? { "Content-Type": "application/json" } : {},
    });
    return { status: r.status(), data: await r.json() };
  }
  assert.equal(
    (
      await staffCall("/login", "POST", {
        username: "qa-staff",
        password: staffPass,
      })
    ).status,
    200,
  );
  assert.equal((await staffCall("/people")).status, 403);
  const newStaffPass = crypto.randomUUID();
  await staffCall("/password", "POST", {
    current: staffPass,
    password: newStaffPass,
  });
  await staffCall("/login", "POST", {
    username: "qa-staff",
    password: newStaffPass,
  });
  assert.equal(
    (await staffCall("/people")).data.some((x) => x.id === p.id),
    false,
  );
  assert.equal((await staffCall("/people/" + p.id, "PUT", p)).status, 403);
  assert.equal(
    (await staffCall("/export", "POST", { ids: [p.id] })).data.length,
    0,
  );
  assert.equal(
    (await staffCall("/summary?from=2026-10-01&to=2027-09-30")).status,
    200,
  );
  assert.equal((await staffCall("/users")).status, 404);
  await staffContext.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, forced password change, person/request/payment form, optimistic locking, Excel download, trash/restore, staff village authorization, global summary, desktop/mobile layout, console health",
  );
} finally {
  await browser.close();
  sql(
    `DELETE FROM people WHERE id='${personId || "missing"}'; DELETE FROM sessions WHERE user_id IN ('${adminId}','${staffId || "missing"}'); DELETE FROM users WHERE id IN ('${adminId}','${staffId || "missing"}'); DELETE FROM audit WHERE actor IN ('${adminId}','${staffId || "missing"}'); DELETE FROM login_limits WHERE key='local';`,
  );
}
