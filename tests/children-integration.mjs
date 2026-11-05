import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { chromium, expect } from "@playwright/test";
import { hashPassword } from "../server/auth.js";
import { childAssistanceType } from "../src/children.js";
import { disabilities } from "../src/domain.js";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";

const fixture = localFixture();
let worker, browser;
try {
  fixture.migrate();
  const password = "Aa1!" + crypto.randomUUID();
  fixture.sql(`INSERT INTO users VALUES('children-admin','children-admin','ทดสอบเด็ก','${await hashPassword(password)}','admin','[]','[]',0,1);
    INSERT INTO users VALUES('children-editor','children-editor','ผู้แก้ไข','${await hashPassword(password)}','staff','["view","edit"]','[1]',0,1);`);
  const person = {
    title: "นาง",
    first: "ผู้ปกครองจำลอง",
    last: "ทดสอบ",
    village: 1,
    disabilities: [],
    requests: [
      {
        id: "child-request",
        category: "0",
        type: childAssistanceType,
        date: "2026-01-01",
        status: "pending",
        note: "",
        payments: [],
      },
    ],
  };
  fixture.sql(
    `INSERT INTO people(id,village,data) VALUES('child-parent',1,'${JSON.stringify(person)}');`,
  );
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  assert.equal(
    (
      await context.request.post(worker.origin + "/api/login", {
        data: { username: "children-admin", password },
      })
    ).status(),
    200,
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function open() {
    await page.goto(worker.origin);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
      .click();
    await page
      .getByRole("button", { name: "แก้ไข ผู้ปกครองจำลอง", exact: true })
      .click();
    await page.locator(".request-group").first().locator("summary").click();
    await page
      .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
      .click();
  }
  await open();
  const section = page.getByRole("region", {
    name: "บุตรหรือเด็กในความอุปการะ",
    exact: true,
  });
  for (const [index, name] of ["เด็กหนึ่ง", "เด็กสอง"].entries()) {
    await section
      .getByRole("button", { name: "เพิ่มบุตรหรือเด็กในความอุปการะ" })
      .click();
    const child = section.getByRole("group", {
      name: `เด็กคนที่ ${index + 1}`,
      exact: true,
    });
    await child.getByLabel("ชื่อ *", { exact: true }).fill(name);
    await child.getByLabel("นามสกุล *", { exact: true }).fill("ทดสอบ");
    await expect(child.getByLabel("สถานภาพ", { exact: true })).toHaveCount(0);
    await expect(
      child.getByLabel("โทรศัพท์มือถือ", { exact: true }),
    ).toHaveCount(0);
  }
  const first = section.getByRole("group", {
    name: "เด็กคนที่ 1",
    exact: true,
  });
  await first
    .getByLabel("วันเดือนปีเกิด · พ.ศ.", { exact: true })
    .fill("01/01/2563");
  await first.getByLabel("ชื่อ *", { exact: true }).click();
  await first.getByLabel(disabilities[0], { exact: true }).check();
  await expect(first.getByLabel("อายุ", { exact: true })).toHaveValue(/6 ปี/);
  await expect(page.locator(".draft-status")).toContainText(
    "เก็บร่างล่าสุดแล้ว",
    { timeout: 15000 },
  );
  const drafts = await (
    await context.request.get(worker.origin + "/api/drafts")
  ).json();
  const draft = await (
    await context.request.get(
      worker.origin + "/api/drafts/" + drafts.items[0].id,
    )
  ).json();
  assert.equal(draft.data.requests[0].children.length, 2);
  assert.equal(draft.data.requests[0].children[0].birth, "2020-01-01");
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  await page.getByRole("button", { name: "กู้คืนร่าง", exact: true }).click();
  await page.locator(".request-group").first().locator("summary").click();
  await page
    .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
    .click();
  await expect(first.getByLabel("ชื่อ *", { exact: true })).toHaveValue(
    "เด็กหนึ่ง",
  );
  await expect(
    first.getByLabel(disabilities[0], { exact: true }),
  ).toBeChecked();
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/bs-sams-children-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await first.scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: "/tmp/bs-sams-children-mobile.png" });
  assert.ok(
    await section.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  );
  await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "แก้ไข ผู้ปกครองจำลอง", exact: true }),
  ).toBeVisible();
  let saved = await (
    await context.request.get(worker.origin + "/api/people/child-parent")
  ).json();
  assert.equal(saved.requests[0].children.length, 2);
  assert.equal(saved.requests[0].children[0].birth, "2020-01-01");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const childRows = page.getByRole("region", {
    name: "บุตรหรือเด็กในความอุปการะของ ผู้ปกครองจำลอง ทดสอบ",
    exact: true,
  });
  const showChildren = page.getByRole("button", {
    name: "แสดงข้อมูลบุตรหรือเด็กในความอุปการะของ ผู้ปกครองจำลอง ทดสอบ",
    exact: true,
  });
  await expect(childRows).toHaveCount(0);
  await expect(showChildren).toHaveAttribute("aria-expanded", "false");
  await showChildren.focus();
  await page.keyboard.press("Enter");
  await expect(childRows).toBeVisible();
  await expect(childRows.getByRole("columnheader")).toHaveText([
    "คำนำหน้า",
    "ชื่อ",
    "นามสกุล",
    "อายุ",
  ]);
  await expect(childRows.locator("tbody tr")).toHaveCount(2);
  await expect(childRows.locator("tbody tr").first()).toContainText(
    "เด็กหนึ่ง",
  );
  await expect(childRows.locator("tbody tr").last()).toContainText("ไม่ระบุ");
  await childRows.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/bs-sams-children-registry-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await childRows.scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: "/tmp/bs-sams-children-registry-mobile.png" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  const hideChildren = page.getByRole("button", {
    name: "หุบข้อมูลบุตรหรือเด็กในความอุปการะของ ผู้ปกครองจำลอง ทดสอบ",
    exact: true,
  });
  await expect(hideChildren).toHaveAttribute("aria-expanded", "true");
  await hideChildren.focus();
  await page.keyboard.press("Space");
  await expect(childRows).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [label, extension] of [
    ["CSV", "csv"],
    ["EXCEL", "xlsx"],
    ["PDF", "pdf"],
  ]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = `/tmp/bs-sams-children-export.${extension}`;
    await (await pending).saveAs(file);
    if (extension === "pdf") {
      const text = execFileSync("pdftotext", ["-raw", file, "-"], {
        encoding: "utf8",
      })
        .replace(/[\s\u200b]/g, "")
        .replace(/ำา/g, "ำ");
      for (const value of [
        "ผู้ปกครองจำลอง",
        "เด็กหนึ่ง",
        "เด็กสอง",
        "01/01/2563",
        childAssistanceType,
        "บุตรหรือเด็กในความอุปการะ",
      ])
        assert.ok(text.includes(value.replace(/\s/g, "")), value);
    } else {
      const workbook = new ExcelJS.Workbook();
      const sheet =
        extension === "csv"
          ? await workbook.csv.readFile(file, { map: (value) => value })
          : (await workbook.xlsx.readFile(file)).worksheets[0];
      assert.equal(sheet.rowCount, 4);
      const cell = (row, header) =>
        sheet.getRow(row).getCell(sheet.getRow(1).values.indexOf(header)).value;
      assert.equal(cell(2, "ชื่อ"), "ผู้ปกครองจำลอง");
      assert.equal(cell(3, "ชื่อ"), "เด็กหนึ่ง");
      assert.equal(cell(4, "ชื่อ"), "เด็กสอง");
      assert.equal(cell(3, "วันเดือนปีเกิด"), "01/01/2563");
      assert.ok(!sheet.getRow(1).values.includes("ความพิการ"));
      assert.ok(!sheet.getRow(1).values.includes("ผู้ยื่นคำขอและคำขอ"));
      assert.equal(cell(3, "ประเภทข้อมูล"), "บุตรหรือเด็กในความอุปการะ");
      assert.equal(cell(3, "ประเภทความช่วยเหลือ"), childAssistanceType);
      if (extension === "xlsx") assert.equal(typeof cell(3, "อายุ"), "number");
    }
  }
  await open();
  await expect(first.getByLabel("ชื่อ *", { exact: true })).toHaveValue(
    "เด็กหนึ่ง",
  );
  await page
    .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
    .selectOption("เงินอุดหนุนสงเคราะห์ครอบครัว");
  await expect(
    section.getByRole("button", { name: "เพิ่มบุตรหรือเด็กในความอุปการะ" }),
  ).toHaveCount(0);
  await expect(first.getByLabel("ชื่อ *", { exact: true })).toHaveValue(
    "เด็กหนึ่ง",
  );
  await page
    .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
    .selectOption(childAssistanceType);
  await first
    .getByRole("button", { name: "ลบเด็กคนที่ 1", exact: true })
    .click();
  await page.getByRole("button", { name: "ยืนยันลบ", exact: true }).click();
  await expect(first.getByLabel("ชื่อ *", { exact: true })).toHaveValue(
    "เด็กสอง",
  );
  await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "แก้ไข ผู้ปกครองจำลอง", exact: true }),
  ).toBeVisible();
  saved = await (
    await context.request.get(worker.origin + "/api/people/child-parent")
  ).json();
  assert.equal(saved.requests[0].children.length, 1);
  const editor = await browser.newContext();
  await editor.request.post(worker.origin + "/api/login", {
    data: { username: "children-editor", password },
  });
  const deletion = structuredClone(saved);
  deletion.requests[0].children = [];
  assert.equal(
    (
      await editor.request.put(worker.origin + "/api/people/child-parent", {
        data: deletion,
      })
    ).status(),
    403,
  );
  const malformed = structuredClone(saved);
  malformed.requests[0].children[0].nationalId = "1234567890123";
  assert.equal(
    (
      await context.request.put(worker.origin + "/api/people/child-parent", {
        data: malformed,
      })
    ).status(),
    400,
  );
  const audit = await (
    await context.request.get(worker.origin + "/api/audit?action=delete-child")
  ).json();
  assert.equal(audit.total, 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: multiple children, dates, disabilities, drafts, persistence, type changes, deletion permissions, audit and mobile layout",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
