import { assertReadable } from "./readability.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
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
    pass = "Aa1!" + crypto.randomUUID(),
    nextPass = "Abcde1!x",
    staffPass = "Aa1!" + crypto.randomUUID();
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
    `INSERT INTO users VALUES('${adminId}','qa-admin','ผู้ดูแลทดสอบ','${await hashPassword(pass)}','admin','[]','[]',1,1);`,
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
    for (const body of ["null", "{", "[]"]) {
      const response = await context.request.post(origin + "/api/login", {
        data: body,
        headers: { "Content-Type": "application/json" },
      });
      assert.equal(response.status(), 400);
    }
    await page.goto(origin);
    for (const copy of [
      "Ban Sadet Social Assistance Monitoring System",
      "ระบบติดตามการช่วยเหลือผู้ประสบปัญหาทางสังคม",
      "กรอกชื่อผู้ใช้และรหัสผ่านของท่าน",
    ])
      await page.getByText(copy, { exact: true }).waitFor();
    await page.setViewportSize({ width: 1919, height: 952 });
    await page.screenshot({
      path: "/tmp/bs-sams-login-desktop.png",
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
      path: "/tmp/bs-sams-login-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "แสดงรหัสผ่าน", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("รหัสผ่าน", { exact: true }).getAttribute("type"),
      "text",
    );
    await page
      .getByRole("button", { name: "ซ่อนรหัสผ่าน", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("รหัสผ่าน", { exact: true }).getAttribute("type"),
      "password",
    );
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("qa-admin");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(pass);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await page.getByLabel("รหัสผ่านปัจจุบัน").waitFor();
    for (const weak of [
      "Abcd1!x",
      "abcdef1!x",
      "ABCDEF1!X",
      "Abcdefg!x",
      "Abcdef12x",
    ]) {
      assert.equal(
        (await call("/password", "POST", { current: pass, password: weak }))
          .status,
        400,
      );
    }
    assert.equal(
      (await context.cookies()).find((cookie) => cookie.name === "session")
        .expires,
      -1,
    );
    assert.equal(await page.getByLabel("รหัสผ่านปัจจุบัน").inputValue(), pass);
    assert.equal(
      await page.getByLabel("รหัสผ่านปัจจุบัน").evaluate((el) => el.readOnly),
      true,
    );
    assert.equal(
      await page.getByLabel("รหัสผ่านใหม่ อย่างน้อย").inputValue(),
      "",
    );
    assert.equal(await page.getByLabel("ยืนยันรหัสผ่านใหม่").inputValue(), "");
    await page.getByLabel("รหัสผ่านใหม่ อย่างน้อย").fill(nextPass);
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(nextPass);
    await page.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" }).click();
    assert.equal(
      await page.getByLabel("รหัสผ่าน", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await page.getByLabel("ชื่อผู้ใช้", { exact: true }).inputValue(),
      "qa-admin",
    );
    assert.notEqual(
      await page.getByLabel("ชื่อผู้ใช้", { exact: true }).inputValue(),
      nextPass,
    );
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(nextPass);
    await page.getByLabel("จดจำการเข้าสู่ระบบ", { exact: true }).check();
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await page.getByRole("heading", { name: "ภาพรวมการช่วยเหลือ" }).waitFor();
    await assertReadable(page, [
      { selector: ".page-head p", minimum: 14 },
      { selector: ".metric-label", minimum: 13 },
      { selector: ".metric-foot", minimum: 13 },
      { selector: ".account-identity > span", minimum: 13 },
    ]);

    const rememberedCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "session",
    );
    const rememberedSeconds = rememberedCookie.expires - Date.now() / 1000;
    assert.ok(
      rememberedSeconds > 30 * 86400 - 60 && rememberedSeconds <= 30 * 86400,
    );
    assert.equal(rememberedCookie.httpOnly, true);
    assert.equal(rememberedCookie.sameSite, "Strict");
    const reopened = await browser.newContext({
      storageState: await context.storageState(),
    });
    assert.equal(
      (await reopened.request.get(origin + "/api/me")).status(),
      200,
    );
    await reopened.close();
    assert.equal((await call("/people")).status, 200);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await page
      .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
      .click();
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("ชื่อ *", { exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    assert.equal(
      await page
        .getByLabel("ชื่อ *", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    await page
      .getByLabel("ชื่อ *", { exact: true })
      .locator("..")
      .getByText("กรุณากรอกข้อมูลช่องนี้", { exact: true })
      .waitFor();
    const nationalIdInput = page.getByLabel("เลขบัตรประชาชน · ไม่บังคับ");
    await nationalIdInput.pressSequentially("123456789012199");
    assert.equal(await nationalIdInput.inputValue(), "1234567890121");
    await nationalIdInput.fill("abc123-456");
    assert.equal(await nationalIdInput.inputValue(), "123456");
    assert.equal(
      await nationalIdInput.evaluate((el) => el.validity.patternMismatch),
      true,
    );
    await nationalIdInput.fill("");
    assert.equal(
      await nationalIdInput.evaluate((el) => el.checkValidity()),
      true,
    );
    await page.getByLabel("ชื่อ *", { exact: true }).fill("บุคคลทดสอบ");
    await page.getByLabel("นามสกุล *", { exact: true }).fill("ระบบ");
    await nationalIdInput.fill("1234567890122");
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await page.waitForFunction(
      () => document.activeElement?.dataset.field === "nationalId",
    );
    await nationalIdInput
      .locator("..")
      .getByText("เลขบัตรประชาชนไม่ถูกต้อง", { exact: true })
      .waitFor();
    await nationalIdInput.fill("");

    await page.getByLabel("วันเดือนปีเกิด").click();
    const calendar = page.getByRole("dialog", {
      name: "เลือกวันที่ พ.ศ.",
      exact: true,
    });
    await calendar.getByLabel("เลือกปี พ.ศ.").selectOption("1953");
    await calendar.getByLabel("เลือกเดือน").selectOption("02");
    await calendar
      .getByRole("button", { name: "01/02/2496", exact: true })
      .click();
    await page.screenshot({ path: "/tmp/bs-sams-calendar-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await calendar.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await page.getByLabel("วันเดือนปีเกิด").click();
    await calendar.getByLabel("เลือกปี พ.ศ.").selectOption("1953");
    await calendar.getByLabel("เลือกเดือน").selectOption("02");
    await calendar
      .getByRole("button", { name: "01/02/2496", exact: true })
      .click();
    await page.screenshot({ path: "/tmp/bs-sams-calendar-mobile.png" });
    await calendar.getByRole("button", { name: "ตกลง", exact: true }).click();
    assert.equal(
      await page.getByLabel("วันเดือนปีเกิด").inputValue(),
      "01/02/2496",
    );
    await page.getByLabel("วันเดือนปีเกิด").click();
    await calendar
      .getByRole("button", { name: "02/02/2496", exact: true })
      .click();
    await calendar.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    assert.equal(
      await page.getByLabel("วันเดือนปีเกิด").inputValue(),
      "01/02/2496",
    );
    await page
      .getByLabel("วันเดือนปีเกิด")
      .locator("..")
      .getByRole("button", { name: "ล้างวันที่", exact: true })
      .click();
    assert.equal(await page.getByLabel("วันเดือนปีเกิด").inputValue(), "");
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.getByLabel("วันเดือนปีเกิด").fill("31/02/2569");
    assert.equal(
      await page
        .getByLabel("วันเดือนปีเกิด")
        .evaluate((el) => el.checkValidity()),
      false,
    );
    await page.getByLabel("วันเดือนปีเกิด").fill("01/01/2533");
    assert.equal(
      await page.getByLabel("วันเดือนปีเกิด").inputValue(),
      "01/01/2533",
    );
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

    assert.equal(
      await page.getByRole("button", { name: /^เพิ่มคำขอ / }).count(),
      7,
    );
    await page
      .getByRole("button", { name: "เพิ่มคำขอ เงินสงเคราะห์", exact: true })
      .click();
    await page
      .getByRole("button", { name: "กลับไปสรุปคำขอ", exact: true })
      .click();
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.activeElement?.dataset.field?.endsWith(".type"),
    );
    await page
      .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
      .locator("..")
      .getByText("กรุณาระบุประเภท วันที่ และสถานะคำขอ", { exact: true })
      .waitFor();

    assert.equal(
      await page.getByLabel("หมวดหมู่", { exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await page.getByLabel("หมวดหมู่", { exact: true }).inputValue(),
      "0",
    );
    await page
      .getByRole("button", { name: "เพิ่มคำขอ เงินซ่อมบ้าน", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("หมวดหมู่", { exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await page.getByLabel("หมวดหมู่", { exact: true }).inputValue(),
      "1",
    );
    assert.equal(
      await page
        .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
        .inputValue(),
      "",
    );
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
    assert.equal(
      await page
        .getByRole("button", { name: "บันทึกการช่วยเหลือ", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", {
        name: "ลบการช่วยเหลือครั้งที่ 1 ในคำขอที่ 1 ที่ยังไม่บันทึก",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "ลบรายการใหม่", exact: true })
      .click();
    await page
      .getByRole("button", { name: "บันทึกการช่วยเหลือ", exact: true })
      .click();
    await page.getByLabel("หน่วยงานผู้ให้ *").fill("หน่วยงานทดสอบ");
    await page.getByLabel("จำนวนเงิน · บาท").fill("3000.30");
    assert.equal(
      await page
        .getByLabel("รายละเอียดความช่วยเหลือ")
        .evaluate((el) => el.required),
      false,
    );
    await page.getByText("3,000.30 บาท", { exact: true }).waitFor();
    await page.getByLabel("สถานะ", { exact: true }).selectOption("done");
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByText("บุคคลทดสอบ ระบบ", { exact: false }).first().waitFor();
    const people = (await call("/people")).data.items;
    const p = people.find((p) => p.first === "บุคคลทดสอบ");
    personId = p.id;
    assert.equal(p.birth, "1990-01-01");
    assert.equal(p.requests[0].payments[0].amount, "3000.30");
    assert.equal(p.requests[0].payments[0].detail, "");
    assert.equal(
      (
        await call("/people/" + p.id, "PUT", {
          ...p,
          requests: [
            {
              ...p.requests[0],
              payments: [
                ...p.requests[0].payments,
                { ...p.requests[0].payments[0], id: crypto.randomUUID() },
              ],
            },
          ],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/people", "POST", {
          ...p,
          nationalId: "",
          requests: [
            {
              ...p.requests[0],
              payments: [
                ...p.requests[0].payments,
                { ...p.requests[0].payments[0], id: crypto.randomUUID() },
              ],
            },
          ],
        })
      ).status,
      400,
    );

    assert.equal(
      (
        await call("/people/" + p.id, "PUT", {
          ...p,
          requests: [{ ...p.requests[0], category: "1" }],
        })
      ).status,
      400,
    );
    const moneySummary = (await call("/summary?from=2026-10-01&to=2027-09-30"))
      .data;
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
    assert.equal(await page.locator(".request-card").count(), 0);
    assert.equal(await page.locator(".request-group").count(), 7);
    assert.ok(
      (await page.locator(".request-received-date").innerText()).includes(
        "ได้รับการช่วยเหลือ",
      ),
    );
    await page.locator(".request-groups").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/bs-sams-request-cards-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".request-tile").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/bs-sams-request-cards-mobile.png" });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page
      .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
      .click();
    await page.getByRole("heading", { name: /คำขอที่ 1/ }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "ยื่นคำขอประเภทนี้อีกครั้ง", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", {
        name: "ลบการช่วยเหลือครั้งที่ 1 ในคำขอที่ 1",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "ยืนยันลบ", exact: true }).click();
    assert.equal(
      await page.getByLabel("สถานะ", { exact: true }).inputValue(),
      "pending",
    );
    assert.equal(await page.locator(".request-card .payment").count(), 0);
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await page
      .getByRole("button", { name: "ละทิ้งการเปลี่ยนแปลง", exact: true })
      .click();
    await page
      .getByRole("button", { name: "แก้ไข บุคคลทดสอบ", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
      .click();
    assert.equal(await page.locator(".request-card .payment").count(), 1);
    assert.equal(await page.locator(".request-card").count(), 1);
    await page.screenshot({
      path: "/tmp/bs-sams-request-editor-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
      .click();
    await page.waitForFunction(() => {
      const heading = document.querySelector(".request-card h3");
      const dialog = heading.closest("dialog");
      return (
        heading.getBoundingClientRect().top >=
          dialog.querySelector(".modal-head").getBoundingClientRect().bottom &&
        heading.getBoundingClientRect().bottom <
          dialog.querySelector(".modal-actions").getBoundingClientRect().top
      );
    });
    const mobileFormActions = await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .boundingBox();
    assert.ok(
      mobileFormActions.y >= 0 &&
        mobileFormActions.y + mobileFormActions.height <= 844,
    );
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
    await page
      .getByRole("button", { name: "ดู บุคคลทดสอบ", exact: true })
      .click();
    assert.equal(
      await page.getByRole("button", { name: /^เพิ่มคำขอ / }).count(),
      0,
    );
    const personDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "ส่งออก PDF รายบุคคล", exact: true })
      .click();
    const personPdf = await personDownload;
    assert.ok(personPdf.suggestedFilename().endsWith(".pdf"));
    await personPdf.saveAs("/tmp/bs-sams-person.pdf");
    const personPdfText = execFileSync(
      "pdftotext",
      ["-raw", "/tmp/bs-sams-person.pdf", "-"],
      { encoding: "utf8" },
    ).replace(/\s/g, "");
    for (const value of ["บุคคลทดสอบ", "หน่วยงานทดสอบ", "3,000.30"])
      assert.ok(personPdfText.includes(value));
    assert.ok(
      execFileSync("pdfinfo", ["/tmp/bs-sams-person.pdf"], {
        encoding: "utf8",
      }).includes("595.28 x 841.89"),
    );
    assert.equal(
      (await call("/audit?action=export-person&target=" + p.id)).data.total,
      1,
    );

    await page
      .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("button", { name: "กลับไปสรุปคำขอ", exact: true })
      .click();
    assert.equal(await page.locator(".request-card").count(), 0);
    await page.getByRole("button", { name: "ปิด", exact: true }).last().click();

    assert.equal((await call("/people")).data.items[0].first, "บุคคลทดสอบ");

    const invalidJson = await context.request.post(origin + "/api/people", {
      data: "null",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(invalidJson.status(), 400);
    assert.equal((await call("/config", "PUT", { name: 7 })).status, 400);
    const savedConfiguration = (await call("/config")).data;
    assert.equal(
      (
        await call("/config", "PUT", {
          ...savedConfiguration,
          villages: [null],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/config", "PUT", {
          ...savedConfiguration,
          types: [null, ...savedConfiguration.types.slice(1)],
        })
      ).status,
      400,
    );

    assert.equal(
      (await call("/people/" + p.id, "DELETE", { reason: 7 })).status,
      400,
    );
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
    await page.getByRole("button", { name: "EXCEL", exact: true }).click();
    const dl = await download;
    assert.ok(dl.suggestedFilename().endsWith(".xlsx"));
    await dl.saveAs("/tmp/bs-sams-qa.xlsx");
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile("/tmp/bs-sams-qa.xlsx");
    assert.equal(book.worksheets[0].rowCount, 2);
    const registryPdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    const registryPdf = await registryPdfDownload;
    assert.ok(registryPdf.suggestedFilename().endsWith(".pdf"));
    await registryPdf.saveAs("/tmp/bs-sams-registry.pdf");
    assert.equal(
      readFileSync("/tmp/bs-sams-registry.pdf").subarray(0, 5).toString(),
      "%PDF-",
    );
    const registryPdfText = execFileSync(
      "pdftotext",
      ["-raw", "/tmp/bs-sams-registry.pdf", "-"],
      { encoding: "utf8" },
    ).replace(/\s/g, "");
    assert.ok(registryPdfText.includes("บุคคลทดสอบ"));

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
    await assertReadable(page, [
      { selector: ".page-head p", minimum: 13 },
      { selector: ".metric-label", minimum: 13 },
      { selector: ".metric-foot", minimum: 13 },
    ]);
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
    await page.getByLabel("ถึงวันที่", { exact: true }).fill("31/10/2570");
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
    const invalidDateExports = [];
    const captureExport = (request) => {
      if (new URL(request.url()).pathname === "/api/report-export")
        invalidDateExports.push(request.url());
    };
    page.on("request", captureExport);
    await page.getByLabel("ตั้งแต่วันที่", { exact: true }).fill("31/02/2569");
    await monthPanel.getByRole("button", { name: "CSV", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "กรุณาตรวจสอบช่วงวันที่ก่อนส่งออกรายงาน" })
      .waitFor();
    assert.deepEqual(invalidDateExports, []);
    page.off("request", captureExport);
    await page.getByLabel("ตั้งแต่วันที่", { exact: true }).fill("01/10/2569");

    const mobileExportLayout = await monthPanel
      .locator(".panel-title")
      .evaluate((el) => {
        const title = el.querySelector("h2").getBoundingClientRect();
        const actions = el.querySelector(".actions").getBoundingClientRect();
        return {
          titleBottom: title.bottom,
          actionsTop: actions.top,
          heights: [...el.querySelectorAll("button")].map(
            (b) => b.getBoundingClientRect().height,
          ),
        };
      });
    assert.ok(mobileExportLayout.actionsTop >= mobileExportLayout.titleBottom);
    assert.ok(mobileExportLayout.heights.every((height) => height >= 44));
    const monthlyScroll = page.getByRole("region", {
      name: "ตารางรายละเอียดรายเดือน",
      exact: true,
    });
    const monthlyFrame = monthlyScroll.locator("..");
    await monthlyFrame
      .getByText("เลื่อนซ้าย–ขวาเพื่อดูข้อมูล", { exact: true })
      .waitFor();
    const firstCellLeft = await monthlyScroll
      .locator("tbody tr")
      .first()
      .locator("td")
      .first()
      .evaluate((el) => el.getBoundingClientRect().left);
    await monthlyScroll.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="ตารางรายละเอียดรายเดือน"]')
          .scrollLeft > 0,
    );
    assert.ok(
      Math.abs(
        (await monthlyScroll
          .locator("tbody tr")
          .first()
          .locator("td")
          .first()
          .evaluate((el) => el.getBoundingClientRect().left)) - firstCellLeft,
      ) < 2,
    );
    await monthlyScroll.evaluate((el) => {
      el.scrollLeft = 0;
      el.blur();
    });
    const skipLink = page.getByRole("link", { name: "ข้ามไปเนื้อหาหลัก" });
    await skipLink.focus();
    await skipLink.press("Enter");
    assert.equal(
      await page
        .locator("#main-content")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByLabel("ตั้งแต่วันที่", { exact: true }).focus();
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
    await monthPanel
      .getByRole("button", { name: "EXCEL", exact: true })
      .click();
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
    const summaryPdfDownload = page.waitForEvent("download");
    await monthPanel.getByRole("button", { name: "PDF", exact: true }).click();
    await (await summaryPdfDownload).saveAs("/tmp/bs-sams-summary.pdf");
    const summaryPdfText = execFileSync(
      "pdftotext",
      ["-raw", "/tmp/bs-sams-summary.pdf", "-"],
      { encoding: "utf8" },
    ).replace(/\s/g, "");
    assert.ok(
      execFileSync("pdfinfo", ["/tmp/bs-sams-summary.pdf"], {
        encoding: "utf8",
      }).includes("รายละเอียดรายเดือน"),
    );
    assert.equal(summaryPdfText.includes("เงินสงเคราะห์"), false);
    assert.ok(summaryPdfText.includes("3000.3"));
    assert.equal(summaryPdfText.includes("บุคคลทดสอบ"), false);
    const monthlyCsvDownload = page.waitForEvent("download");
    await monthPanel.getByRole("button", { name: "CSV", exact: true }).click();
    await (await monthlyCsvDownload).saveAs("/tmp/bs-sams-monthly.csv");
    const monthlyCsv = readFileSync("/tmp/bs-sams-monthly.csv", "utf8");
    assert.ok(monthlyCsv.includes("3000.3"));
    assert.equal(monthlyCsv.includes("เงินสงเคราะห์"), false);
    await page
      .getByLabel("รูปแบบรายงาน", { exact: true })
      .selectOption("village");
    const villagePanel = page.locator("section.panel").filter({
      has: page.getByRole("heading", {
        name: "จำนวนผู้ประสบปัญหารายหมู่บ้าน",
        exact: true,
      }),
    });
    const villageDownload = page.waitForEvent("download");
    await villagePanel
      .getByRole("button", { name: "EXCEL", exact: true })
      .click();
    await (await villageDownload).saveAs("/tmp/bs-sams-villages.xlsx");
    const villageBook = new ExcelJS.Workbook();
    await villageBook.xlsx.readFile("/tmp/bs-sams-villages.xlsx");
    const villageValues = [];
    villageBook.worksheets[0].eachRow((row) =>
      villageValues.push(row.getCell(1).value),
    );
    assert.ok(villageValues.includes("หมู่บ้าน"));
    assert.equal(villageValues.includes("เดือน"), false);
    const villagePdfDownload = page.waitForEvent("download");
    await villagePanel
      .getByRole("button", { name: "PDF", exact: true })
      .click();
    await (await villagePdfDownload).saveAs("/tmp/bs-sams-villages.pdf");
    assert.ok(
      execFileSync("pdfinfo", ["/tmp/bs-sams-villages.pdf"], {
        encoding: "utf8",
      }).includes("จำนวนผู้ประสบปัญหารายหมู่บ้าน"),
    );

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
      (await call("/people/" + p.id, "DELETE", { reason: "ทดสอบถังขยะ" }))
        .status,
      200,
    );
    assert.ok(
      (await call("/people?trash=1")).data.items.some((x) => x.id === p.id),
    );
    assert.equal(
      (await call("/people/" + p.id + "/export", "POST", {})).status,
      404,
    );

    assert.equal(
      (await call("/people/" + p.id + "/restore", "POST", {})).status,
      200,
    );
    const beforeInvalidRestore = (
      await call(`/audit?action=restore&target=${p.id}`)
    ).data.total;
    const versionBeforeInvalidRestore = (await call(`/people?q=${p.id}`)).data
      .items[0].version;
    assert.equal(
      (await call(`/people/${p.id}/restore`, "POST", {})).status,
      409,
    );
    assert.equal(
      (await call(`/audit?action=restore&target=${p.id}`)).data.total,
      beforeInvalidRestore,
    );
    assert.equal(
      (await call(`/people?q=${p.id}`)).data.items[0].version,
      versionBeforeInvalidRestore,
    );

    assert.equal(
      (
        await call(`/people/${p.id}/restore`, "DELETE", {
          reason: "เส้นทางผิด",
        })
      ).status,
      404,
    );
    assert.equal((await call(`/people/${p.id}/restore`, "PUT", p)).status, 404);
    const purgeFixture = (
      await call("/people", "POST", {
        ...p,
        first: "ทดสอบลบถาวร",
        nationalId: "",
        requests: [],
      })
    ).data;
    assert.equal(
      (await call(`/people/${purgeFixture.id}/purge`, "DELETE", { version: 1 }))
        .status,
      409,
    );
    await call(`/people/${purgeFixture.id}`, "DELETE", {
      reason: "ทดสอบลบถาวร",
    });
    assert.equal(
      (await call(`/people/${purgeFixture.id}/purge`, "DELETE", { version: 1 }))
        .status,
      409,
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา" })
      .click();
    await page.getByRole("button", { name: "ถังขยะ", exact: true }).click();
    await page
      .getByRole("button", { name: "ลบถาวร ทดสอบลบถาวร ระบบ", exact: true })
      .hover();
    await assertReadable(page, [
      { selector: ".danger-button:hover", minimum: 13 },
    ]);

    await page
      .getByRole("button", { name: "ลบถาวร ทดสอบลบถาวร ระบบ", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "ลบข้อมูลถาวร", exact: true })
      .getByRole("button", { name: "ยกเลิก", exact: true })
      .click();
    assert.ok(
      (await call("/people?trash=1")).data.items.some(
        (x) => x.id === purgeFixture.id,
      ),
    );
    await page
      .getByRole("button", { name: "ลบถาวร ทดสอบลบถาวร ระบบ", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ยืนยันลบถาวร", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
      .last()
      .click();
    assert.equal(
      (await call("/people?trash=1")).data.items.some(
        (x) => x.id === purgeFixture.id,
      ),
      false,
    );
    assert.equal(
      (await call(`/people/${purgeFixture.id}/restore`, "POST", {})).status,
      404,
    );
    assert.equal(
      (await call(`/audit?action=purge-person&target=${purgeFixture.id}`)).data
        .total,
      1,
    );
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
    const newStaffPass = "Aa1!" + crypto.randomUUID();
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
    await call(`/people/${p.id}`, "DELETE", { reason: "ทดสอบสิทธิ์ลบถาวร" });
    assert.equal(
      (await staffCall(`/people/${p.id}/restore`, "POST", {})).status,
      403,
    );
    const trashedPerson = (await call("/people?trash=1")).data.items.find(
      (x) => x.id === p.id,
    );
    assert.equal(
      (
        await staffCall(`/people/${p.id}/purge`, "DELETE", {
          version: trashedPerson.version,
        })
      ).status,
      403,
    );
    assert.ok(
      (await call("/people?trash=1")).data.items.some((x) => x.id === p.id),
    );
    await call(`/people/${p.id}/restore`, "POST", {});

    assert.equal(
      (await staffCall("/people/" + p.id + "/export", "POST", {})).status,
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

    // These intentionally similar fixtures represent distinct people; acknowledge each warning explicitly.
    async function createReviewedPerson(body) {
      let result = await call("/people", "POST", body);
      if (result.data.code === "DUPLICATE_REVIEW")
        result = await call("/people", "POST", {
          ...body,
          duplicateReviewToken: result.data.token,
        });
      return result;
    }
    // Verify server paging and export across pages using the real browser and D1.
    for (let i = 0; i < 14; i++) {
      const created = await createReviewedPerson({
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
      if (i === 12) {
        assert.equal(
          (
            await staffCall(
              "/people/" + created.data.id + "/export",
              "POST",
              {},
            )
          ).status,
          200,
        );
        const account = (await call("/users")).data.find(
          (user) => user.id === staffId,
        );
        assert.equal(
          (
            await call("/users", "PUT", {
              ...account,
              permissions: ["view", "edit"],
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await staffCall("/login", "POST", {
              username: "qa-staff",
              password: newStaffPass,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await staffCall(
              "/people/" + created.data.id + "/export",
              "POST",
              {},
            )
          ).status,
          403,
        );
        assert.equal((await call("/users", "PUT", account)).status, 200);
        assert.equal(
          (
            await staffCall("/login", "POST", {
              username: "qa-staff",
              password: newStaffPass,
            })
          ).status,
          200,
        );
      }
    }
    const secondPage = await call("/people?q=ทดสอบแบ่งหน้า&page=2&size=10");
    assert.equal(secondPage.data.total, 14);
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
    await page.getByRole("button", { name: "EXCEL", exact: true }).click();
    await (await filteredDownload).saveAs("/tmp/bs-sams-filtered.xlsx");
    const filteredBook = new ExcelJS.Workbook();
    await filteredBook.xlsx.readFile("/tmp/bs-sams-filtered.xlsx");
    const filteredPdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await (await filteredPdfDownload).saveAs("/tmp/bs-sams-filtered.pdf");
    const filteredPdfText = execFileSync(
      "pdftotext",
      ["-raw", "/tmp/bs-sams-filtered.pdf", "-"],
      { encoding: "utf8" },
    ).replace(/\s/g, "");
    assert.ok(filteredPdfText.includes("ทดสอบแบ่งหน้า11"));
    assert.equal(filteredPdfText.includes("บุคคลทดสอบ"), false);

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

    // Administrator audit queries use the same applied filters on every page.
    const auditPage = await call("/audit?action=create-person&size=10&page=2");
    assert.equal(auditPage.status, 200);
    assert.equal(auditPage.data.total, 16);
    assert.equal(auditPage.data.items.length, 6);
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
    await page.getByText("ทั้งหมด 16 รายการ", { exact: true }).waitFor();
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
    // Password reset is a separate administrator operation and revokes existing sessions.
    const tempPassword = "Aa1!" + crypto.randomUUID(),
      finalStaffPassword = "Aa1!" + crypto.randomUUID();
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
      .fill("Aa1!" + crypto.randomUUID());
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
    const accountTrigger = page.getByRole("button", { name: /^เมนูผู้ใช้ / });
    assert.equal(
      await page
        .locator("header.topbar")
        .getByRole("button", { name: /^เมนูผู้ใช้ / })
        .count(),
      1,
    );
    assert.equal(
      await page
        .locator("aside")
        .getByRole("button", { name: /^เมนูผู้ใช้ / })
        .count(),
      0,
    );
    await accountTrigger.click();
    await page.getByRole("menu", { name: "เมนูบัญชีผู้ใช้" }).waitFor();
    await page.screenshot({ path: "/tmp/bs-sams-account-menu-desktop.png" });
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page
        .getByRole("menuitem", { name: "ออกจากระบบ", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(await accountTrigger.getAttribute("aria-expanded"), "false");
    await accountTrigger.click();
    await page
      .getByRole("heading", { name: "จัดการผู้ใช้งาน", exact: true })
      .click();
    assert.equal(await accountTrigger.getAttribute("aria-expanded"), "false");
    await page.setViewportSize({ width: 390, height: 844 });
    await accountTrigger.click();
    await page.screenshot({ path: "/tmp/bs-sams-account-menu-mobile.png" });
    await page
      .getByRole("menuitem", { name: "เปลี่ยนรหัสผ่าน", exact: true })
      .click();
    await page.setViewportSize({ width: 1536, height: 1024 });
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
    const rotated = "Aa1!" + crypto.randomUUID();
    await page
      .getByLabel("รหัสผ่านปัจจุบัน", { exact: true })
      .fill("wrong-password");
    await page.getByLabel("รหัสผ่านใหม่ อย่างน้อย").fill(rotated);
    await page
      .getByLabel("ยืนยันรหัสผ่านใหม่")
      .fill("Aa1!" + crypto.randomUUID());
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
      await page.getByLabel("ชื่อผู้ใช้", { exact: true }).inputValue(),
      "qa-admin",
    );
    assert.equal(
      await page.getByLabel("รหัสผ่าน", { exact: true }).inputValue(),
      "",
    );
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

    const deleteFixture = await createReviewedPerson({
      ...p,
      nationalId: "",
      requests: [{ ...p.requests[0], id: crypto.randomUUID() }],
    });
    assert.equal(deleteFixture.status, 201);
    const deletePerson = deleteFixture.data;
    const requestId = deletePerson.requests[0].id;
    const paymentId = deletePerson.requests[0].payments[0].id;
    const withoutPayment = await call("/people/" + deletePerson.id, "PUT", {
      ...deletePerson,
      requests: [
        { ...deletePerson.requests[0], status: "pending", payments: [] },
      ],
    });
    assert.equal(withoutPayment.status, 200);
    assert.equal(withoutPayment.data.requests[0].payments.length, 0);
    const withoutRequest = await call("/people/" + deletePerson.id, "PUT", {
      ...withoutPayment.data,
      requests: [],
    });
    assert.equal(withoutRequest.status, 200);
    assert.equal(withoutRequest.data.requests.length, 0);
    assert.equal(
      (await call("/audit?action=delete-assistance&target=" + paymentId)).data
        .total,
      1,
    );
    assert.equal(
      (await call("/audit?action=delete-request&target=" + requestId)).data
        .total,
      1,
    );
    await page.reload();
    await page
      .getByRole("heading", { name: "ภาพรวมการช่วยเหลือ", exact: true })
      .waitFor();
    await page.getByRole("button", { name: /^เมนูผู้ใช้ / }).click();
    await page
      .getByRole("menuitem", { name: "ออกจากระบบ", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "เข้าสู่ระบบ", exact: true })
      .waitFor();
    assert.equal((await call("/me")).status, 401);
    await otherDevice.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: isolated Worker/D1, login, forced and self-service password changes, all-device session revocation, server-side filters/pagination and full filtered Excel export, person/request/payment form with unsaved-change confirmation and draft removal, saved-history protection, exact satang totals and numeric Excel cells, admin password reset and account deactivation/reactivation, paginated Thai audit filters and admin-only access, optimistic locking with accurate audit, mixed request statuses, Excel download, trash/restore, staff authorization, desktop/mobile layout, console health",
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
