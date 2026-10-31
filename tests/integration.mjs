import { summarize } from "./helpers/reference-summary.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { monthLabel } from "../src/domain.js";
import { hashPassword } from "../server/auth.js";
const stateDir = mkdtempSync(join(tmpdir(), "bs-sams-qa-"));
let worker;
try {
  const portProbe = createServer();
  await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const origin = `http://127.0.0.1:${port}`,
    pass = crypto.randomUUID(),
    nextPass = crypto.randomUUID(),
    staffPass = crypto.randomUUID();
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: "/workspace/BS-SAMS/.wrangler/config",
    WRANGLER_LOG_PATH: "/tmp/bs-sams-test.log",
  };
  function sql(s) {
    const file = join(stateDir, "fixture.sql");
    writeFileSync(file, s, { mode: 0o600 });
    try {
      execFileSync(
        "node_modules/.bin/wrangler",
        [
          "d1",
          "execute",
          "bs-sams",
          "--local",
          "--persist-to",
          stateDir,
          "--file",
          file,
        ],
        { env, stdio: "pipe" },
      );
    } finally {
      unlinkSync(file);
    }
  }
  execFileSync(
    "node_modules/.bin/wrangler",
    [
      "d1",
      "migrations",
      "apply",
      "bs-sams",
      "--local",
      "--persist-to",
      stateDir,
    ],
    { env, stdio: "pipe" },
  );
  const adminId = "qa-" + crypto.randomUUID();
  sql(
    `INSERT INTO users(id,username,name,password,role,permissions,villages,must_change,active) VALUES('${adminId}','qa-admin','ผู้ดูแลทดสอบ','${await hashPassword(pass)}','admin','[]','[]',1,1);`,
  );
  worker = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      stateDir,
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  worker.stdout.resume();
  worker.stderr.resume();
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (worker.exitCode !== null)
      throw Error("QA Worker exited before readiness");
    try {
      if ((await fetch(origin + "/api/me")).status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw Error("QA Worker did not become ready");
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
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await page.getByLabel("รหัสผ่านปัจจุบัน").fill(pass);
    await page.getByLabel("รหัสผ่านใหม่ อย่างน้อย").fill(nextPass);
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(nextPass);
    await page.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("qa-admin");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(nextPass);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
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
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await page
      .getByRole("dialog", { name: "ยังมีข้อมูลที่ไม่ได้บันทึก", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "กลับไปแก้ไข", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("ชื่อ *", { exact: true }).inputValue(),
      "บุคคลทดสอบ",
    );
    assert.equal(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      true,
    );

    await page.getByRole("button", { name: "เพิ่มคำขอ", exact: true }).click();
    await page.getByRole("button", { name: "เพิ่มคำขอ", exact: true }).click();
    await page
      .getByRole("button", { name: "ลบคำขอที่ 2 ที่ยังไม่บันทึก", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "ลบรายการที่ยังไม่บันทึก", exact: true })
      .getByRole("button", { name: "ลบรายการใหม่", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "ไปที่คำขอที่ 2", exact: true })
        .count(),
      0,
    );

    await page
      .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
      .fill("เงินสงเคราะห์ทดสอบ");
    await page
      .getByRole("button", { name: "บันทึกการช่วยเหลือ", exact: true })
      .click();
    await page.getByLabel("หน่วยงานผู้ให้ *").fill("หน่วยงานทดสอบ");
    await page.getByLabel("จำนวนเงิน · บาท").fill("3000");
    await page
      .getByRole("button", { name: "บันทึกการช่วยเหลือ", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "ลบการช่วยเหลือครั้งที่ 2 ในคำขอที่ 1 ที่ยังไม่บันทึก",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "ลบรายการที่ยังไม่บันทึก", exact: true })
      .getByRole("button", { name: "ลบรายการใหม่", exact: true })
      .click();
    assert.equal(await page.getByLabel("จำนวนเงิน · บาท").inputValue(), "3000");

    await page
      .getByLabel("รายละเอียดความช่วยเหลือ *")
      .fill("ข้อมูลจำลองสำหรับทดสอบ จะลบหลังทดสอบ");
    for (const amount of ["0.10", "0.20"]) {
      await page
        .getByRole("button", { name: "บันทึกการช่วยเหลือ", exact: true })
        .click();
      await page
        .getByLabel("หน่วยงานผู้ให้ *", { exact: true })
        .last()
        .fill("หน่วยงานทดสอบ");
      await page
        .getByLabel("จำนวนเงิน · บาท", { exact: true })
        .last()
        .fill(amount);
      await page
        .getByLabel("รายละเอียดความช่วยเหลือ *", { exact: true })
        .last()
        .fill("ทดสอบยอดสตางค์");
    }
    await page.getByText("3,000.30 บาท", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("สถานะ", { exact: true }).inputValue(),
      "pending",
    );
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByText("บุคคลทดสอบ ระบบ", { exact: false }).first().waitFor();
    const people = (await call("/people")).data.items;
    const listPerson = people.find((p) => p.first === "บุคคลทดสอบ");
    const p = (await call("/people/" + listPerson.id)).data;
    assert.equal(p.requests[0].status, "done");
    await page.getByText("ตัวกรองเพิ่มเติม", { exact: true }).click();
    await page
      .getByLabel("ประเภทความช่วยเหลือ", { exact: true })
      .selectOption("0");
    await page.getByLabel("ช่วงวัย", { exact: true }).selectOption("adult");
    await page
      .getByLabel("ประเภทความพิการ", { exact: true })
      .selectOption("none");
    await page
      .getByLabel("ประเภทความช่วยเหลือย่อย", { exact: true })
      .fill(p.requests[0].type);
    await page
      .getByLabel("ยื่นคำขอตั้งแต่วันที่", { exact: true })
      .fill(p.requests[0].date);
    await page
      .getByLabel("ยื่นคำขอถึงวันที่", { exact: true })
      .fill(p.requests[0].date);
    const advancedResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/people?") && r.url().includes("ageGroup=adult"),
    );
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    assert.equal((await (await advancedResponse).json()).total, 1);
    await page
      .getByRole("button", { name: "ดู บุคคลทดสอบ", exact: true })
      .waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "/tmp/bs-sams-advanced-search-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/bs-sams-advanced-search-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    assert.equal((await call("/people?ageGroup=other")).status, 400);
    assert.equal(
      (
        await call("/export", "POST", {
          filters: { ageGroup: "senior", q: p.id },
        })
      ).data.length,
      0,
    );

    personId = p.id;
    for (const field of [
      "nationalId",
      "phone",
      "birth",
      "house",
      "houseCode",
      "disabilities",
      "requests",
    ])
      assert.equal(Object.hasOwn(listPerson, field), false);
    await page
      .getByRole("button", { name: "ดู บุคคลทดสอบ", exact: true })
      .click();
    const details = page.getByRole("dialog", {
      name: "รายละเอียดผู้ประสบปัญหา",
      exact: true,
    });
    await details
      .getByRole("heading", { name: "นายบุคคลทดสอบ ระบบ", exact: true })
      .waitFor();
    assert.equal(await details.getByRole("textbox").count(), 0);
    await details.getByText("3,000.30", { exact: false }).first().waitFor();
    assert.equal(
      await details.getByText("หน่วยงานทดสอบ", { exact: true }).count(),
      3,
    );
    await page.screenshot({
      path: "/tmp/bs-sams-person-details-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/bs-sams-person-details-mobile.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await details
      .getByRole("button", { name: "แก้ไขข้อมูล", exact: true })
      .click();
    await page.getByLabel("ชื่อ *", { exact: true }).waitFor();
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });

    assert.equal(p.requests[0].payments[0].amount, "3000");
    const moneySummary = (await call("/summary?from=2026-10-01&to=2027-09-30"))
      .data;
    assert.deepEqual(moneySummary, summarize([p], "2026-10-01", "2027-09-30"));
    assert.equal(moneySummary.amount, 3000.3);
    assert.equal(moneySummary.monthly[0].amount, 3000.3);
    const invalidMoney = {
      ...p,
      requests: [
        {
          ...p.requests[0],
          payments: p.requests[0].payments.map((x, i) =>
            i === 0 ? { ...x, amount: "0.001" } : x,
          ),
        },
      ],
    };
    assert.equal(
      (await call("/people/" + p.id, "PUT", invalidMoney)).status,
      400,
    );
    const invalidDate = {
      ...p,
      requests: [
        {
          ...p.requests[0],
          payments: p.requests[0].payments.map((x, i) =>
            i === 0 ? { ...x, date: "2099-01-01" } : x,
          ),
        },
      ],
    };
    assert.equal(
      (await call("/people/" + p.id, "PUT", invalidDate)).status,
      400,
    );

    assert.equal(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
    );
    assert.equal(
      (await call("/people/" + p.id, "PUT", { ...p, requests: [] })).status,
      400,
    );
    assert.equal(
      (
        await call("/people/" + p.id, "PUT", {
          ...p,
          requests: [{ ...p.requests[0], status: "progress", payments: [] }],
        })
      ).status,
      400,
    );
    await page
      .getByRole("button", { name: "แก้ไข บุคคลทดสอบ", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", {
          name: "ลบคำขอที่ 1 ที่ยังไม่บันทึก",
          exact: true,
        })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
      .click();
    await page.screenshot({
      path: "/tmp/bs-sams-request-editor-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/bs-sams-request-editor-mobile.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.getByLabel("ชื่อ *", { exact: true }).fill("แก้ไขแล้วยกเลิก");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "ละทิ้งการเปลี่ยนแปลง", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await call("/people")).data.items[0].first, "บุคคลทดสอบ");

    const auditBefore = (await call("/audit?size=100")).data.items.filter(
      (x) => x.action === "update-person" && x.target === p.id,
    ).length;
    const stale = await call("/people/" + p.id, "PUT", { ...p, version: 0 });
    assert.equal(stale.status, 409);
    assert.equal(
      (await call("/people/" + p.id, "PUT", { ...p, version: 0, requests: [] }))
        .status,
      409,
    );
    assert.equal(
      (await call("/audit?size=100")).data.items.filter(
        (x) => x.action === "update-person" && x.target === p.id,
      ).length,
      auditBefore,
    );
    const updated = await call("/people/" + p.id, "PUT", {
      ...p,
      requests: [
        ...p.requests,
        {
          ...p.requests[0],
          id: crypto.randomUUID(),
          status: "rejected",
          reason: "ไม่เข้าเกณฑ์",
          payments: [],
        },
      ],
    });
    assert.equal(updated.status, 200);
    assert.equal(
      (await call("/audit?size=100")).data.items.filter(
        (x) => x.action === "update-person" && x.target === p.id,
      ).length,
      auditBefore + 1,
    );
    const mixedSummary = await call("/summary?from=2026-10-01&to=2027-09-30");
    assert.deepEqual(
      mixedSummary.data,
      summarize([updated.data], "2026-10-01", "2027-09-30"),
    );
    assert.equal(mixedSummary.data.done, 0);
    assert.equal(mixedSummary.data.partial, 1);
    p.requests = updated.data.requests;
    p.version = updated.data.version;
    const restored = await call("/people/" + p.id, "PUT", p);
    assert.equal(restored.status, 200);
    p.version = restored.data.version;
    const exportResponse = await call("/export", "POST", {
      filters: { q: p.id },
    });
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
    assert.equal(
      typeof book.worksheets[0].getRow(2).getCell(7).value,
      "number",
    );
    await page
      .getByLabel("ชื่อ นามสกุล / เลขบัตร / เลขทะเบียน")
      .fill("ไม่พบข้อมูลนี้");
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    await page
      .getByRole("heading", { name: "ไม่พบข้อมูลตามเงื่อนไข" })
      .waitFor();
    await page
      .getByRole("button", { name: "ล้างตัวกรอง", exact: true })
      .click();
    await page.screenshot({
      path: "/tmp/bs-sams-registry.png",
      fullPage: true,
    });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ภาพรวม", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "ผู้ประสบปัญหารายหมู่บ้าน", exact: true })
      .waitFor();
    await page.screenshot({
      path: "/tmp/bs-sams-dashboard.png",
      fullPage: true,
    });
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
      .getByRole("heading", {
        name: "จำนวนผู้ประสบปัญหาตามประเภทความช่วยเหลือ",
      })
      .waitFor();
    const reportResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/summary?") && r.url().includes("to=2027-10-31"),
    );
    await page.getByLabel("ถึงวันที่", { exact: true }).fill("2027-10-31");
    const reportSummary = await (await reportResponse).json();
    assert.equal(reportSummary.monthly.length, 13);
    await page
      .getByRole("combobox", { name: "ปีงบประมาณ" })
      .filter({ has: page.locator("option:checked[value=custom]") })
      .waitFor();
    assert.equal(JSON.stringify(reportSummary).includes("บุคคลทดสอบ"), false);
    const monthPanel = page.locator("section.panel").filter({
      has: page.getByRole("heading", {
        name: "รายละเอียดรายเดือน",
        exact: true,
      }),
    });
    await monthPanel
      .getByText(monthLabel("2027-10"), { exact: true })
      .waitFor();
    assert.equal(await monthPanel.getByRole("row").count(), 14);
    await page.screenshot({
      path: "/tmp/bs-sams-report-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.screenshot({
      path: "/tmp/bs-sams-report-desktop.png",
      fullPage: true,
    });
    const rawExports = [];
    const watchRequest = (r) => {
      if (new URL(r.url()).pathname === "/api/export") rawExports.push(r.url());
    };
    page.on("request", watchRequest);
    const reportDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "XLSX", exact: true }).click();
    await (await reportDownload).saveAs("/tmp/bs-sams-summary.xlsx");
    page.off("request", watchRequest);
    assert.deepEqual(rawExports, []);
    const summaryBook = new ExcelJS.Workbook();
    await summaryBook.xlsx.readFile("/tmp/bs-sams-summary.xlsx");
    const values = [];
    summaryBook.worksheets[0].eachRow((row) =>
      values.push(row.getCell(1).value),
    );
    assert.ok(values.includes(monthLabel("2026-10")));
    assert.ok(values.includes(monthLabel("2027-10")));
    let moneyRow;
    summaryBook.worksheets[0].eachRow((row) => {
      if (row.getCell(1).value === monthLabel("2026-10")) moneyRow = row;
    });
    assert.equal(moneyRow.getCell(6).value, 3000.3);
    assert.equal(moneyRow.getCell(6).type, ExcelJS.ValueType.Number);

    assert.equal(
      (await call("/summary?from=2026-02-30&to=2026-03-01")).status,
      400,
    );
    assert.equal(
      (
        await call("/report-export", "POST", {
          from: "2026-10-01",
          to: "2025-01-01",
        })
      ).status,
      400,
    );
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ตั้งค่าระบบ" })
      .click();
    await page.getByLabel("ชื่อระบบ", { exact: true }).waitFor();
    const originalConfig = (await call("/config")).data;
    await page
      .getByLabel("ชื่อระบบ", { exact: true })
      .fill("ร่างการตั้งค่าที่ยังไม่บันทึก");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ตั้งค่าระบบ", exact: true })
      .click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await page
      .getByRole("dialog", { name: "ยังมีข้อมูลที่ไม่ได้บันทึก", exact: true })
      .waitFor();
    await page.screenshot({
      path: "/tmp/bs-sams-navigation-guard-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/bs-sams-navigation-guard-mobile.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page
      .getByRole("button", { name: "กลับไปแก้ไข", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("ชื่อระบบ", { exact: true }).inputValue(),
      "ร่างการตั้งค่าที่ยังไม่บันทึก",
    );
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await page
      .getByRole("dialog", { name: "ยังมีข้อมูลที่ไม่ได้บันทึก", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "กลับไปแก้ไข", exact: true })
      .click();
    assert.equal((await call("/me")).status, 200);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await page
      .getByRole("button", { name: "ละทิ้งและดำเนินการต่อ", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
      .waitFor();
    assert.equal((await call("/config")).data.name, originalConfig.name);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ตั้งค่าระบบ", exact: true })
      .click();
    await page.getByLabel("ชื่อระบบ", { exact: true }).waitFor();

    const configWrites = await Promise.all([
      call("/config", "PUT", { ...originalConfig, name: "ระบบทดสอบผู้ดูแล A" }),
      call("/config", "PUT", { ...originalConfig, name: "ระบบทดสอบผู้ดูแล B" }),
    ]);
    assert.deepEqual(configWrites.map((r) => r.status).sort(), [200, 409]);
    const winner = configWrites.find((r) => r.status === 200).data;
    const configAudit = await call("/audit?action=update-config");
    assert.equal(configAudit.data.total, 1);
    await page
      .getByRole("button", { name: "บันทึกการตั้งค่า", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "มีผู้ดูแลแก้ไขการตั้งค่าแล้ว" })
      .waitFor();
    await page
      .getByLabel("ชื่อระบบ", { exact: true })
      .fill("การแก้ไขที่ต้องเก็บไว้");
    await page
      .getByRole("button", { name: "โหลดค่าล่าสุด", exact: true })
      .click();
    await page
      .getByRole("button", { name: "กลับไปแก้ไข", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("ชื่อระบบ", { exact: true }).inputValue(),
      "การแก้ไขที่ต้องเก็บไว้",
    );
    await page
      .getByRole("button", { name: "โหลดค่าล่าสุด", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ละทิ้งและโหลดใหม่", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.getByLabel("ชื่อระบบ", { exact: true }).inputValue(),
      winner.name,
    );
    await page
      .getByLabel("ชื่อระบบ", { exact: true })
      .fill(originalConfig.name);

    await page
      .getByRole("button", { name: "บันทึกการตั้งค่า", exact: true })
      .click();
    await page
      .getByText("บันทึกการตั้งค่าเรียบร้อยแล้ว", { exact: true })
      .waitFor();
    const currentConfig = (await call("/config")).data;
    const withTypes = {
      ...currentConfig,
      types: currentConfig.types.map((t, i) =>
        i === 0
          ? { ...t, items: [" ตัวอย่าง ", "", "ตัวอย่าง", "อีกประเภท"] }
          : t,
      ),
    };
    const normalized = (await call("/config", "PUT", withTypes)).data;
    assert.deepEqual(normalized.types[0].items, ["ตัวอย่าง", "อีกประเภท"]);
    const inactive = (
      await call("/config", "PUT", {
        ...normalized,
        villages: normalized.villages.map((v) =>
          v.id <= 2 ? { ...v, active: false } : v,
        ),
      })
    ).data;
    assert.equal(
      (await call("/people", "POST", { ...p, id: undefined })).status,
      400,
    );
    // Per-person updates use the item route, even when keeping an inactive address.
    const inactiveEdit = await call("/people/" + p.id, "PUT", p);
    assert.equal(inactiveEdit.status, 200);
    p.version = inactiveEdit.data.version;
    assert.equal(
      (await call("/people/" + p.id, "PUT", { ...p, village: 2 })).status,
      400,
    );
    await page
      .getByRole("button", { name: "โหลดค่าล่าสุด", exact: true })
      .click();
    await page.getByRole("button", { name: "หมู่บ้าน", exact: true }).click();
    await page.screenshot({
      path: "/tmp/bs-sams-settings-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/bs-sams-settings-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await page
      .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("หมู่บ้าน *", { exact: true }).inputValue(),
      "3",
    );
    assert.equal(
      await page
        .getByLabel("หมู่บ้าน *", { exact: true })
        .getByRole("option", { name: "หมู่ 1 บ้านทรายมูล", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    assert.equal(
      (
        await call("/config", "PUT", {
          ...originalConfig,
          revision: inactive.revision,
        })
      ).status,
      200,
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ตั้งค่าระบบ" })
      .click();
    await page
      .getByRole("button", { name: "โหลดค่าล่าสุด", exact: true })
      .click();

    await page
      .getByRole("navigation")
      .getByRole("button", { name: "จัดการผู้ใช้งาน" })
      .click();
    await page
      .getByRole("button", { name: "เพิ่มผู้ใช้งาน", exact: true })
      .click();
    await page.getByLabel("ชื่อผู้ใช้ · a–z, 0–9, จุด, ขีด").waitFor();
    await page
      .getByLabel("ชื่อผู้ใช้ · a–z, 0–9, จุด, ขีด")
      .fill("unsaved-account");
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "ยังมีข้อมูลที่ไม่ได้บันทึก", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "กลับไปแก้ไข", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("ชื่อผู้ใช้ · a–z, 0–9, จุด, ขีด").inputValue(),
      "unsaved-account",
    );

    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await page
      .getByRole("button", { name: "ละทิ้งการเปลี่ยนแปลง", exact: true })
      .click();
    assert.equal(
      (await call("/users")).data.some((u) => u.username === "unsaved-account"),
      false,
    );

    const beforeDelete = (await call("/people/" + p.id)).data;
    assert.equal(
      (
        await call("/people/" + p.id, "DELETE", {
          reason: "ทดสอบถังขยะ",
          version: beforeDelete.version + 100,
        })
      ).status,
      409,
    );
    const deletingBody = {
      reason: "ทดสอบถังขยะ",
      version: beforeDelete.version,
    };
    const deletedResults = await Promise.all([
      call("/people/" + p.id, "DELETE", deletingBody),
      call("/people/" + p.id, "DELETE", deletingBody),
    ]);
    assert.ok(deletedResults.every((r) => r.status === 200));
    assert.equal(deletedResults.filter((r) => r.data.changed).length, 1);
    const archive = (await call("/people/" + p.id + "?trash=1")).data;
    assert.equal(archive.version, beforeDelete.version + 1);
    assert.equal(archive.deleteReason, "ทดสอบถังขยะ");
    assert.equal((await call("/people/" + p.id)).status, 404);
    assert.equal(
      (await call("/export", "POST", { filters: { q: p.id } })).data.length,
      0,
    );
    assert.equal(
      (await call("/people/" + p.id, "DELETE", deletingBody)).data.changed,
      false,
    );
    assert.equal(
      (
        await call("/people/" + p.id, "DELETE", {
          ...deletingBody,
          reason: "เหตุผลคำสั่งซ้ำ",
        })
      ).data.changed,
      false,
    );
    assert.equal(
      (await call("/people/" + p.id + "?trash=1")).data.deleteReason,
      "ทดสอบถังขยะ",
    );

    assert.equal(
      (await call("/audit?action=delete-person&target=" + p.id)).data.total,
      1,
    );
    assert.equal(
      (
        await call("/people/" + p.id + "/restore", "POST", {
          version: archive.version + 100,
        })
      ).status,
      409,
    );
    const restoredResults = await Promise.all([
      call("/people/" + p.id + "/restore", "POST", {
        version: archive.version,
      }),
      call("/people/" + p.id + "/restore", "POST", {
        version: archive.version,
      }),
    ]);
    assert.ok(restoredResults.every((r) => r.status === 200));
    assert.equal(restoredResults.filter((r) => r.data.changed).length, 1);
    assert.equal(
      (
        await call("/people/" + p.id + "/restore", "POST", {
          version: archive.version,
        })
      ).data.changed,
      false,
    );
    assert.equal(
      (await call("/audit?action=restore&target=" + p.id)).data.total,
      1,
    );
    assert.equal(
      (await call("/people/" + p.id)).data.version,
      beforeDelete.version + 2,
    );
    assert.equal(
      (await call("/people/" + p.id, "DELETE", deletingBody)).status,
      409,
    );
    // Review a deleted record and explicitly confirm restoration through the UI.
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await page
      .getByRole("button", { name: "ลบ บุคคลทดสอบ", exact: true })
      .click();
    await page
      .getByLabel("เหตุผลการลบ", { exact: true })
      .fill("ทดสอบการกู้คืนผ่านหน้าจอ");
    await page
      .getByRole("button", { name: "ย้ายเข้าถังขยะ", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "ย้ายข้อมูลเข้าถังขยะ", exact: true })
      .waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "ถังขยะ", exact: true }).click();
    await page
      .getByRole("button", {
        name: "ดูทะเบียนในถังขยะ บุคคลทดสอบ",
        exact: true,
      })
      .click();
    const trashDetails = page.getByRole("dialog", {
      name: "ทะเบียนในถังขยะ",
      exact: true,
    });
    await trashDetails
      .getByText("เหตุผล: ทดสอบการกู้คืนผ่านหน้าจอ", { exact: true })
      .waitFor();
    assert.equal(
      await trashDetails
        .getByRole("button", { name: "แก้ไขข้อมูล", exact: true })
        .count(),
      0,
    );
    await page.screenshot({
      path: "/tmp/bs-sams-trash-details-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/bs-sams-trash-details-mobile.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await trashDetails
      .getByRole("button", { name: "กู้คืนทะเบียน", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "ยืนยันกู้คืนทะเบียน", exact: true })
      .getByRole("button", { name: "ยืนยันกู้คืน", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "ยืนยันกู้คืนทะเบียน", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal((await call("/people/" + p.id)).status, 200);
    await page
      .getByRole("main")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
      .click();
    await call("/users", "POST", {
      username: "qa-staff",
      active: true,
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
      (await staffCall("/people")).data.items.some((x) => x.id === p.id),
      false,
    );
    assert.equal((await staffCall("/people/" + p.id, "PUT", p)).status, 403);
    assert.equal((await staffCall("/people/" + p.id)).status, 404);
    assert.equal((await staffCall("/people/" + p.id + "?trash=1")).status, 404);
    assert.equal(
      (await staffCall("/people/" + p.id + "/restore", "POST", { version: 1 }))
        .status,
      403,
    );

    assert.equal(
      (await staffCall("/export", "POST", { filters: { q: p.id } })).data
        .length,
      0,
    );
    assert.equal(
      (await staffCall("/summary?from=2026-10-01&to=2027-09-30")).status,
      200,
    );
    assert.equal((await staffCall("/users")).status, 404);
    assert.equal((await staffCall("/audit?size=100")).status, 404);
    const staffSummary = await staffCall("/report-export", "POST", {
      from: "2026-10-01",
      to: "2027-09-30",
    });
    assert.equal(staffSummary.status, 200);
    assert.equal(staffSummary.data.people, 0);
    assert.equal(staffSummary.data.helpedPeople, 0);
    assert.equal(
      (
        await call("/report-export", "POST", {
          from: "2026-10-01",
          to: "2027-09-30",
        })
      ).data.people,
      1,
    );

    // Verify server paging and export across pages using the real browser and D1.
    for (let i = 0; i < 14; i++) {
      const created = await call("/people", "POST", {
        ...p,
        first: "ทดสอบแบ่งหน้า" + String(i).padStart(2, "0"),
        last: "ทดสอบ",
        village: i < 12 ? 1 : 2,
        requests: [
          {
            ...p.requests[0],
            id: crypto.randomUUID(),
            status: "pending",
            payments: [],
          },
        ],
      });
      assert.equal(created.status, 201);
    }
    const secondPage = await call("/people?q=ทดสอบแบ่งหน้า&page=2&size=10");
    assert.equal(secondPage.data.total, 14);
    const aggregateRows = (await call("/export", "POST", { filters: {} })).data;
    assert.deepEqual(
      (await call("/summary?from=2026-10-01&to=2027-09-30")).data,
      summarize(aggregateRows, "2026-10-01", "2027-09-30"),
    );
    assert.deepEqual(
      (
        await staffCall("/report-export", "POST", {
          from: "2026-10-01",
          to: "2027-09-30",
        })
      ).data,
      summarize(
        aggregateRows.filter((p) => p.village === 2),
        "2026-10-01",
        "2027-09-30",
      ),
    );

    assert.equal(secondPage.data.items.length, 4);
    assert.equal((await call("/people?size=1000")).status, 400);
    assert.equal(
      (await staffCall("/people?q=ทดสอบแบ่งหน้า&village=1")).data.total,
      0,
    );
    assert.equal(
      (
        await staffCall("/export", "POST", {
          filters: { q: "ทดสอบแบ่งหน้า", village: "1" },
        })
      ).data.length,
      0,
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await page
      .getByLabel("ชื่อ นามสกุล / เลขบัตร / เลขทะเบียน")
      .fill("ทดสอบแบ่งหน้า");
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    await page.getByText("ทั้งหมด 14 รายการ", { exact: true }).waitFor();
    await page.getByRole("button", { name: "หน้าถัดไป", exact: true }).click();
    await page.getByText("2 / 2", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "ดู ทดสอบแบ่งหน้า10", exact: true })
      .waitFor();
    const filteredDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Excel", exact: true }).click();
    await (await filteredDownload).saveAs("/tmp/bs-sams-filtered.xlsx");
    const filteredBook = new ExcelJS.Workbook();
    await filteredBook.xlsx.readFile("/tmp/bs-sams-filtered.xlsx");
    assert.equal(filteredBook.worksheets[0].rowCount, 15);
    await page.getByLabel("หมู่บ้าน", { exact: true }).selectOption("1");
    await page
      .getByLabel("ประเภทความช่วยเหลือ", { exact: true })
      .selectOption("0");
    await page
      .getByLabel("สถานะการช่วยเหลือ", { exact: true })
      .selectOption("pending");
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    await page.getByText("ทั้งหมด 12 รายการ", { exact: true }).waitFor();
    await page.getByLabel("แสดง", { exact: false }).selectOption("25");
    await page.getByText("1 / 1", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "ดู ทดสอบแบ่งหน้า11", exact: true })
      .waitFor();
    await page.screenshot({
      path: "/tmp/bs-sams-paged-registry.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/bs-sams-paged-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });

    // A view-only staff member can open details but cannot edit or export.
    const readerPass = crypto.randomUUID(),
      readerFinal = crypto.randomUUID();
    assert.equal(
      (
        await call("/users", "POST", {
          username: "qa-reader",
          name: "เจ้าหน้าที่อ่านอย่างเดียว",
          role: "staff",
          permissions: ["view"],
          villages: [1],
          active: true,
          password: readerPass,
        })
      ).status,
      200,
    );
    const reader = await browser.newContext();
    await reader.request.post(origin + "/api/login", {
      data: { username: "qa-reader", password: readerPass },
    });
    await reader.request.post(origin + "/api/password", {
      data: { current: readerPass, password: readerFinal },
    });
    await reader.request.post(origin + "/api/login", {
      data: { username: "qa-reader", password: readerFinal },
    });
    const readerPage = await reader.newPage();
    await readerPage.goto(origin);
    await readerPage
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await readerPage
      .getByLabel("ชื่อ นามสกุล / เลขบัตร / เลขทะเบียน")
      .fill(p.id);
    await readerPage
      .getByRole("button", { name: "ค้นหา", exact: true })
      .click();
    await readerPage
      .getByRole("button", { name: "ดู บุคคลทดสอบ", exact: true })
      .click();
    const readerDetails = readerPage.getByRole("dialog", {
      name: "รายละเอียดผู้ประสบปัญหา",
      exact: true,
    });
    await readerDetails
      .getByRole("heading", { name: "นายบุคคลทดสอบ ระบบ", exact: true })
      .waitFor();
    assert.equal(
      await readerDetails
        .getByRole("button", { name: "แก้ไขข้อมูล", exact: true })
        .count(),
      0,
    );
    assert.equal(
      (
        await reader.request.put(origin + "/api/people/" + p.id, { data: p })
      ).status(),
      403,
    );
    await readerDetails
      .getByRole("button", { name: "ปิดรายละเอียด", exact: true })
      .click();
    assert.equal(
      await readerPage
        .getByRole("button", { name: "Excel", exact: true })
        .isDisabled(),
      true,
    );
    await reader.close();
    // Administrator audit queries use the same applied filters on every page.
    const auditPage = await call("/audit?action=create-person&size=10&page=2");
    assert.equal(auditPage.status, 200);
    assert.equal(auditPage.data.total, 15);
    assert.equal(auditPage.data.items.length, 5);
    assert.ok(
      auditPage.data.items.every((a) => a.actor_username === "qa-admin"),
    );
    assert.equal((await call("/audit?action=invalid")).status, 400);
    assert.equal((await call("/audit", "POST", {})).status, 404);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ตั้งค่าระบบ" })
      .click();
    await page
      .getByRole("button", { name: "ประวัติการใช้งาน", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "ประวัติการใช้งาน", exact: true })
      .waitFor();
    await page
      .getByLabel("การดำเนินการ", { exact: true })
      .selectOption("create-person");
    await page
      .getByRole("button", { name: "ค้นหาประวัติ", exact: true })
      .click();
    await page.getByText("ทั้งหมด 15 รายการ", { exact: true }).waitFor();
    await page.getByLabel("แสดง", { exact: false }).selectOption("10");
    await page
      .getByRole("button", { name: "ประวัติหน้าถัดไป", exact: true })
      .click();
    await page.getByText("2 / 2", { exact: true }).waitFor();
    await page
      .getByLabel("รหัสรายการที่เกี่ยวข้อง", { exact: true })
      .fill(p.id);
    await page
      .getByRole("button", { name: "ค้นหาประวัติ", exact: true })
      .click();
    await page.getByText("ทั้งหมด 1 รายการ", { exact: true }).waitFor();
    await page.screenshot({
      path: "/tmp/bs-sams-audit-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/bs-sams-audit-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    // Duplicate warnings are scoped and opening the existing record preserves the draft.
    assert.equal(
      (
        await call("/people/duplicate-check", "POST", {
          first: p.first,
          last: p.last,
          birth: p.birth,
          id: p.id,
        })
      ).data.total,
      0,
    );
    assert.equal(
      (
        await staffCall("/people/duplicate-check", "POST", {
          first: p.first,
          last: p.last,
          birth: p.birth,
        })
      ).data.total,
      0,
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await page
      .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
      .click();
    await page.getByLabel("ชื่อ *", { exact: true }).fill(p.first);
    await page.getByLabel("นามสกุล *", { exact: true }).fill(p.last);
    await page.getByLabel("วันเดือนปีเกิด").fill(p.birth);
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    const duplicateDialog = () =>
      page.getByRole("dialog", { name: "พบทะเบียนที่อาจซ้ำ", exact: true });
    await duplicateDialog().waitFor();
    await page.screenshot({
      path: "/tmp/bs-sams-duplicates-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/bs-sams-duplicates-mobile.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await duplicateDialog()
      .getByRole("button", { name: "ดูทะเบียนเดิม", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "รายละเอียดผู้ประสบปัญหา", exact: true })
      .getByRole("heading", { name: "นายบุคคลทดสอบ ระบบ", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "ปิดรายละเอียด", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("ชื่อ *", { exact: true }).inputValue(),
      p.first,
    );
    assert.equal(
      (await call("/people?q=" + encodeURIComponent(p.first))).data.total,
      1,
    );
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await duplicateDialog()
      .getByRole("button", { name: "กลับไปตรวจสอบ", exact: true })
      .click();
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await duplicateDialog()
      .getByRole("button", {
        name: "ยืนยันว่าเป็นคนละบุคคลและบันทึก",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "เพิ่มผู้ประสบปัญหาทางสังคม", exact: true })
      .waitFor({ state: "hidden" });
    await duplicateDialog().waitFor({ state: "hidden" });
    assert.equal(
      (await call("/people?q=" + encodeURIComponent(p.first))).data.total,
      2,
    );
    const prefix = "123456789012";
    const checksum =
      (11 -
        ([...prefix].reduce((sum, d, i) => sum + Number(d) * (13 - i), 0) %
          11)) %
      10;
    const testNationalId = prefix + checksum;
    assert.equal(
      (
        await call("/people", "POST", {
          ...p,
          id: undefined,
          nationalId: testNationalId,
          first: "ทะเบียนเลขบัตรทดสอบ",
          last: "ระบบ",
          requests: [],
        })
      ).status,
      201,
    );
    await page
      .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
      .click();
    await page.getByLabel("ชื่อ *", { exact: true }).fill("ชื่อใหม่ทดสอบ");
    await page.getByLabel("นามสกุล *", { exact: true }).fill("ระบบ");
    await page
      .getByLabel("เลขบัตรประชาชน · ไม่บังคับ", { exact: true })
      .fill(testNationalId);
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await duplicateDialog()
      .getByText("หมู่ 1 · เลขบัตรประชาชนตรงกัน", { exact: true })
      .waitFor();
    assert.equal(
      await duplicateDialog()
        .getByRole("button", {
          name: "ยืนยันว่าเป็นคนละบุคคลและบันทึก",
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      (
        await call("/people", "POST", {
          ...p,
          id: undefined,
          nationalId: testNationalId,
          first: "ทดสอบเลขบัตรซ้ำ",
          requests: [],
        })
      ).status,
      409,
    );

    await duplicateDialog()
      .getByRole("button", { name: "กลับไปตรวจสอบ", exact: true })
      .click();
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await page
      .getByRole("button", { name: "ละทิ้งการเปลี่ยนแปลง", exact: true })
      .click();
    const racePassword = crypto.randomUUID();
    // Concurrent administrator writes cannot silently overwrite each other.
    assert.equal(
      (
        await call("/users", "POST", {
          username: "qa-race",
          name: "บัญชีทดสอบการบันทึกพร้อมกัน",
          role: "staff",
          permissions: ["view"],
          villages: [1],
          active: true,
          password: racePassword,
        })
      ).status,
      200,
    );
    const raceAccount = (await call("/users")).data.find(
      (u) => u.username === "qa-race",
    );
    const raceResults = await Promise.all([
      call("/users", "PUT", { ...raceAccount, name: "ชื่อจากผู้ดูแลหนึ่ง" }),
      call("/users", "PUT", { ...raceAccount, name: "ชื่อจากผู้ดูแลสอง" }),
    ]);
    assert.deepEqual(raceResults.map((r) => r.status).sort(), [200, 409]);
    const raceWinner = (await call("/users")).data.find(
      (u) => u.id === raceAccount.id,
    );
    assert.equal(raceWinner.version, raceAccount.version + 1);
    assert.equal(
      (await call("/audit?action=update-user&target=" + raceAccount.id)).data
        .total,
      1,
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "จัดการผู้ใช้งาน" })
      .click();
    const raceRow = () => page.getByRole("row").filter({ hasText: "qa-race" });
    await raceRow()
      .getByRole("button", { name: "แก้ไขสิทธิ์", exact: true })
      .click();
    await page
      .getByLabel("ชื่อแสดงในระบบ", { exact: true })
      .fill("ฉบับร่างที่ต้องเก็บไว้");
    assert.equal(
      (
        await call("/users", "PUT", {
          ...raceWinner,
          name: "ชื่อที่เพิ่งบันทึก",
        })
      ).status,
      200,
    );
    const conflictResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/users") && r.request().method() === "PUT",
    );
    await page
      .getByRole("button", { name: "บันทึกบัญชี", exact: true })
      .click();
    assert.equal((await conflictResponse).status(), 409);
    await page
      .getByRole("dialog")
      .getByText("บัญชีมีการเปลี่ยนแปลงแล้ว", { exact: false })
      .waitFor();
    assert.equal(
      await page.getByLabel("ชื่อแสดงในระบบ", { exact: true }).inputValue(),
      "ฉบับร่างที่ต้องเก็บไว้",
    );
    await page.screenshot({
      path: "/tmp/bs-sams-account-conflict-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/bs-sams-account-conflict-mobile.png" });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await page
      .getByRole("button", { name: "ละทิ้งการเปลี่ยนแปลง", exact: true })
      .click();
    await page
      .getByRole("button", { name: "โหลดรายชื่อล่าสุด", exact: true })
      .click();
    await raceRow().getByText("ชื่อที่เพิ่งบันทึก", { exact: true }).waitFor();
    // Only one password rotation from the same credential version may succeed.
    const raceContext = await browser.newContext();
    assert.equal(
      (
        await raceContext.request.post(origin + "/api/login", {
          data: { username: "qa-race", password: racePassword },
        })
      ).status(),
      200,
    );
    const rotations = [crypto.randomUUID(), crypto.randomUUID()];
    const rotationResults = await Promise.all(
      rotations.map((password) =>
        raceContext.request.post(origin + "/api/password", {
          data: { current: racePassword, password },
        }),
      ),
    );
    assert.equal(rotationResults.filter((r) => r.status() === 200).length, 1);
    assert.ok(
      rotationResults.every((r) => [200, 401, 409].includes(r.status())),
    );
    assert.equal(
      (await call("/audit?action=change-password&target=" + raceAccount.id))
        .data.total,
      1,
    );
    const rotationResultsAccount = (await call("/users")).data.find(
      (u) => u.id === raceAccount.id,
    );
    assert.equal(rotationResultsAccount.version, raceWinner.version + 2);
    assert.equal(rotationResultsAccount.mustChange, false);
    assert.equal(
      (await raceContext.request.get(origin + "/api/me")).status(),
      401,
    );
    assert.equal(
      (
        await raceContext.request.post(origin + "/api/login", {
          data: {
            username: "qa-race",
            password:
              rotations[rotationResults.findIndex((r) => r.status() === 200)],
          },
        })
      ).status(),
      200,
    );
    await raceContext.close();
    // Password reset is a separate administrator operation and revokes existing sessions.
    const tempPassword = crypto.randomUUID(),
      finalStaffPassword = crypto.randomUUID();
    assert.equal(
      (
        await staffCall("/users/" + staffId + "/reset-password", "POST", {
          password: tempPassword,
        })
      ).status,
      404,
    );
    const staffRecord = (await call("/users")).data.find(
      (u) => u.id === staffId,
    );
    assert.equal(
      (await call("/users", "PUT", { ...staffRecord, password: tempPassword }))
        .status,
      400,
    );
    assert.equal((await staffCall("/me")).status, 200);
    assert.equal(
      (await call("/users", "PUT", { ...staffRecord, id: "missing-user" }))
        .status,
      404,
    );
    assert.equal(
      (
        await call("/users/" + adminId + "/reset-password", "POST", {
          password: tempPassword,
        })
      ).status,
      400,
    );
    const ownRecord = (await call("/users")).data.find((u) => u.id === adminId);
    assert.equal(
      (await call("/users", "PUT", { ...ownRecord, active: false })).status,
      400,
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "จัดการผู้ใช้งาน" })
      .click();
    await page
      .getByRole("button", { name: "รีเซ็ตรหัสผ่าน qa-staff", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "รีเซ็ตรหัสผ่าน · qa-staff", exact: true })
      .waitFor();
    await page.screenshot({
      path: "/tmp/bs-sams-reset-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/bs-sams-reset-mobile.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page
      .getByLabel("รหัสผ่านชั่วคราวใหม่", { exact: true })
      .fill(tempPassword);
    await page
      .getByLabel("ยืนยันรหัสผ่านชั่วคราว", { exact: true })
      .fill(crypto.randomUUID());
    await page
      .getByRole("button", { name: "ยืนยันรีเซ็ตรหัสผ่าน", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "รหัสผ่านชั่วคราวไม่ตรงกัน" })
      .waitFor();
    await page
      .getByLabel("ยืนยันรหัสผ่านชั่วคราว", { exact: true })
      .fill(tempPassword);
    await page
      .getByRole("button", { name: "ยืนยันรีเซ็ตรหัสผ่าน", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "รีเซ็ตรหัสผ่านให้ qa-staff แล้ว" })
      .waitFor();
    assert.equal((await staffCall("/me")).status, 401);
    assert.equal(
      (
        await staffCall("/login", "POST", {
          username: "qa-staff",
          password: newStaffPass,
        })
      ).status,
      401,
    );
    const temporaryLogin = await staffCall("/login", "POST", {
      username: "qa-staff",
      password: tempPassword,
    });
    assert.equal(temporaryLogin.status, 200);
    assert.equal(temporaryLogin.data.mustChange, true);
    assert.equal((await staffCall("/people")).status, 403);
    assert.equal(
      (
        await staffCall("/password", "POST", {
          current: tempPassword,
          password: finalStaffPassword,
        })
      ).status,
      200,
    );
    await staffCall("/login", "POST", {
      username: "qa-staff",
      password: finalStaffPassword,
    });
    const refreshedUsers = page.waitForResponse(
      (r) => r.url().endsWith("/api/users") && r.request().method() === "GET",
    );
    await page
      .getByRole("button", { name: "โหลดรายชื่อล่าสุด", exact: true })
      .click();
    await refreshedUsers;
    await page
      .getByRole("button", { name: "โหลดรายชื่อล่าสุด", exact: true })
      .waitFor();
    const userRow = () =>
      page.getByRole("row").filter({
        has: page.getByRole("cell", { name: "qa-staff", exact: true }),
      });
    await userRow()
      .getByRole("button", { name: "แก้ไขสิทธิ์", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("รหัสชั่วคราวใหม่", { exact: false }).count(),
      0,
    );
    await page.getByLabel("เปิดใช้งานบัญชี", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "บันทึกบัญชี", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await staffCall("/me")).status, 401);
    assert.equal(
      (
        await staffCall("/login", "POST", {
          username: "qa-staff",
          password: finalStaffPassword,
        })
      ).status,
      401,
    );
    await userRow()
      .getByRole("button", { name: "รีเซ็ตรหัสผ่าน qa-staff", exact: true })
      .waitFor();
    assert.equal(
      await userRow()
        .getByRole("button", { name: "รีเซ็ตรหัสผ่าน qa-staff", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      (
        await call("/users/" + staffId + "/reset-password", "POST", {
          password: tempPassword,
        })
      ).status,
      409,
    );
    await userRow()
      .getByRole("button", { name: "แก้ไขสิทธิ์", exact: true })
      .click();
    await page.getByLabel("เปิดใช้งานบัญชี", { exact: true }).check();
    await page
      .getByRole("button", { name: "บันทึกบัญชี", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const reactivated = await staffCall("/login", "POST", {
      username: "qa-staff",
      password: finalStaffPassword,
    });
    assert.equal(reactivated.status, 200);
    assert.deepEqual(reactivated.data.villages, [2]);
    // Rejected stale writes must leave the current session and password intact.
    assert.equal(
      (await call("/users", "PUT", { ...staffRecord, active: false })).status,
      409,
    );
    assert.equal(
      (
        await call("/users/" + staffId + "/reset-password", "POST", {
          password: tempPassword,
          version: staffRecord.version,
        })
      ).status,
      409,
    );
    assert.equal((await staffCall("/me")).status, 200);
    const resetAudit = await call(
      "/audit?action=reset-password&target=" + staffId,
    );
    assert.equal(resetAudit.data.total, 1);
    assert.equal(JSON.stringify(resetAudit.data).includes(tempPassword), false);
    await staffContext.close();
    // Normal users can rotate their password without waiting for an admin reset.
    const otherDevice = await browser.newContext();
    await otherDevice.request.post(origin + "/api/login", {
      data: { username: "qa-admin", password: nextPass },
    });
    await page
      .getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.screenshot({
      path: "/tmp/bs-sams-password-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/bs-sams-password-mobile.png",
      fullPage: true,
    });
    const rotated = crypto.randomUUID();
    await page
      .getByLabel("รหัสผ่านปัจจุบัน", { exact: true })
      .fill("wrong-password");
    await page.getByLabel("รหัสผ่านใหม่ อย่างน้อย").fill(rotated);
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(crypto.randomUUID());
    await page
      .getByRole("button", { name: "บันทึกรหัสผ่านใหม่", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "รหัสผ่านใหม่ไม่ตรงกัน" })
      .waitFor();
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(rotated);
    await page
      .getByRole("button", { name: "บันทึกรหัสผ่านใหม่", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "รหัสผ่านเดิมไม่ถูกต้อง" })
      .waitFor();
    assert.equal((await call("/me")).status, 200);
    await page.getByLabel("รหัสผ่านปัจจุบัน", { exact: true }).fill(nextPass);
    await page
      .getByRole("button", { name: "บันทึกรหัสผ่านใหม่", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" })
      .waitFor();
    assert.equal((await call("/me")).status, 401);
    assert.equal(
      (await otherDevice.request.get(origin + "/api/me")).status(),
      401,
    );
    assert.equal(
      (
        await call("/login", "POST", {
          username: "qa-admin",
          password: nextPass,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("/login", "POST", {
          username: "qa-admin",
          password: rotated,
        })
      ).status,
      200,
    );
    await otherDevice.close();
    // Confirming logout from a dirty settings form actually ends the session.
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("qa-admin");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(rotated);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "ภาพรวมการช่วยเหลือ", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ตั้งค่าระบบ", exact: true })
      .click();
    await page
      .getByLabel("ชื่อระบบ", { exact: true })
      .fill("ร่างก่อนออกจากระบบ");
    await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
    await page.getByRole("button", { name: "ออกจากระบบ", exact: true }).click();
    await page
      .getByRole("button", { name: "ละทิ้งและดำเนินการต่อ", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "เข้าสู่ระบบ", exact: true })
      .waitFor();
    assert.equal((await call("/me")).status, 401);

    assert.deepEqual(errors, []);
    console.log(
      "PASS: isolated Worker/D1, login, forced and self-service password changes, all-device session revocation, server-side filters/pagination and full filtered Excel export, person/request/payment form with unsaved-change confirmation and draft removal, saved-history protection, concurrent/idempotent trash lifecycle and archive review, unsaved settings navigation/logout and account close confirmations, scoped duplicate warnings with preserved draft previews, advanced age/disability/request-date filters, minimal registry data and fresh authorized person details, exact satang totals and numeric Excel cells, admin password reset and account deactivation/reactivation, paginated Thai audit filters and admin-only access, optimistic locking with accurate audit, mixed request statuses, Excel download, trash/restore, staff authorization, desktop/mobile layout, console health",
    );
  } finally {
    await browser.close();
    sql(
      `DELETE FROM people WHERE id='${personId || "missing"}'; DELETE FROM sessions WHERE user_id IN ('${adminId}','${staffId || "missing"}'); DELETE FROM users WHERE id IN ('${adminId}','${staffId || "missing"}'); DELETE FROM audit WHERE actor IN ('${adminId}','${staffId || "missing"}'); DELETE FROM login_limits WHERE key='local';`,
    );
  }
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill("SIGTERM");
    await Promise.race([
      once(worker, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (worker.exitCode === null) {
      worker.kill("SIGKILL");
      await once(worker, "exit");
    }
  }
  rmSync(stateDir, { recursive: true, force: true });
}
