import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { chromium, expect } from "@playwright/test";
import { hashPassword } from "../server/auth.js";
import { submissionChannels } from "../src/domain.js";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";

const fixture = localFixture();
const password = "Aa1!" + crypto.randomUUID();
let worker, browser;
try {
  fixture.migrate();
  fixture.sql(
    `INSERT INTO users VALUES('channels-qa','channels-qa','ทดสอบช่องทาง','${await hashPassword(password)}','admin','[]','[]',0,1);`,
  );
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const login = await context.request.post(worker.origin + "/api/login", {
    data: { username: "channels-qa", password },
  });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(worker.origin);
  await page
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  await page
    .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
    .click();
  await page.getByLabel("ชื่อ *", { exact: true }).fill("ทดสอบช่องทาง");
  await page.getByLabel("นามสกุล *", { exact: true }).fill("ยื่นคำร้อง");
  await page.getByLabel("บ้านเลขที่", { exact: true }).fill("001/2");
  await page.getByLabel("วันเดือนปีเกิด", { exact: false }).fill("01/01/2533");
  for (const label of submissionChannels)
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByText(/เก็บร่างล่าสุดแล้ว เวลา/).waitFor();
  await expect
    .poll(
      async () => {
        const list = await (
          await context.request.get(worker.origin + "/api/drafts")
        ).json();
        if (!list.items.length) return [];
        const draft = await (
          await context.request.get(
            worker.origin + "/api/drafts/" + list.items[0].id,
          )
        ).json();
        return draft.data.submissionChannels;
      },
      { timeout: 10000 },
    )
    .toEqual(submissionChannels);
  await page
    .locator(".submission-channels")
    .screenshot({ path: "/tmp/bs-sams-submission-channels.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page
    .locator(".submission-channels")
    .screenshot({ path: "/tmp/bs-sams-submission-channels-mobile.png" });
  await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const saved = await (
    await context.request.get(worker.origin + "/api/people")
  ).json();
  const person = saved.items[0];
  assert.deepEqual(person.submissionChannels, submissionChannels);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  await page
    .getByRole("button", { name: "แก้ไข ทดสอบช่องทาง", exact: true })
    .click();
  for (const label of submissionChannels)
    assert.equal(
      await page
        .getByRole("checkbox", { name: label, exact: true })
        .isChecked(),
      true,
    );
  await page
    .getByRole("checkbox", { name: submissionChannels[0], exact: true })
    .uncheck();
  await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const edited = await (
    await context.request.get(worker.origin + "/api/people/" + person.id)
  ).json();
  assert.deepEqual(edited.submissionChannels, [submissionChannels[1]]);
  // Select both again so that both labels are verified in actual downloaded PDFs.
  await page
    .getByRole("button", { name: "แก้ไข ทดสอบช่องทาง", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: submissionChannels[0], exact: true })
    .check();
  await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXCEL", exact: true }).click();
  const excelFile = "/tmp/bs-sams-channels-registry.xlsx";
  await (await excelDownload).saveAs(excelFile);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelFile);
  const sheet = workbook.worksheets[0];
  const channelColumn = sheet.getRow(1).values.indexOf("แหล่งที่มาของเคส");
  assert.ok(channelColumn > 0);
  assert.equal(sheet.getColumn(channelColumn).alignment.wrapText, true);
  assert.ok(sheet.getRow(2).height >= 36);
  assert.deepEqual(
    new Set(sheet.getRow(2).getCell(channelColumn).value.split("\n")),
    new Set(submissionChannels),
  );
  const headers = sheet.getRow(1).values.slice(1);
  assert.ok(!headers.includes("เลขทะเบียน"));
  assert.ok(!headers.includes("สถานะ"));
  for (const heading of ["เลขบัตรประชาชน", "โทรศัพท์", "ประเภทความช่วยเหลือ"])
    assert.equal(
      sheet.getRow(2).getCell(headers.indexOf(heading) + 1).text,
      "",
    );
  assert.equal(
    sheet.getRow(2).getCell(headers.indexOf("บ้านเลขที่") + 1).value,
    "001/2",
  );
  assert.equal(
    sheet.getRow(2).getCell(headers.indexOf("วันเดือนปีเกิด") + 1).value,
    "01/01/2533",
  );
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const csvFile = "/tmp/bs-sams-channels-registry.csv";
  await (await csvDownload).saveAs(csvFile);
  const csvBook = new ExcelJS.Workbook();
  const csvSheet = await csvBook.csv.readFile(csvFile, {
    map: (value) => value,
  });
  for (let row = 1; row <= sheet.rowCount; row++) {
    assert.deepEqual(
      csvSheet.getRow(row).values.slice(1).map(String),
      sheet.getRow(row).values.slice(1).map(String),
    );
  }
  async function checkPdf(button, file) {
    const pending = page.waitForEvent("download");
    await button.click();
    const download = await pending;
    await download.saveAs(file);
    // Poppler may repeat sara aa when extracting shaped Thai sara am.
    const text = execFileSync("pdftotext", ["-raw", file, "-"], {
      encoding: "utf8",
    })
      .replace(/[\s\u200b]/g, "")
      .replace(/ำา/g, "ำ");
    assert.equal(text.includes("ไม่ระบุ"), false);
    for (const label of ["แหล่งที่มาของเคส", ...submissionChannels, "001/2"])
      assert.ok(text.includes(label.replace(/\s/g, "")), label);
  }
  await checkPdf(
    page.getByRole("button", { name: "PDF", exact: true }),
    "/tmp/bs-sams-channels-registry.pdf",
  );
  await page
    .getByRole("button", { name: "ดู ทดสอบช่องทาง", exact: true })
    .click();
  await checkPdf(
    page.getByRole("button", { name: "ส่งออก PDF รายบุคคล", exact: true }),
    "/tmp/bs-sams-channels-person.pdf",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: both checkboxes, private drafts, create/edit/reload persistence, uncheck, desktop/mobile, matching CSV/Excel and registry/individual PDF downloads with house numbers, no runtime errors",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
