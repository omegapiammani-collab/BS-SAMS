import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { chromium, expect } from "@playwright/test";
import { hashPassword } from "../server/auth.js";
import { submissionChannels } from "../src/domain.js";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";
const fixture = localFixture();
let worker, browser;
try {
  fixture.migrate();
  const password = "Aa1!" + crypto.randomUUID();
  fixture.sql(
    `INSERT INTO users VALUES('filter-qa','filter-qa','ทดสอบตัวกรอง','${await hashPassword(password)}','admin','[]','[]',0,1);`,
  );
  const selections = [
    [submissionChannels[0]],
    [submissionChannels[0]],
    [submissionChannels[1]],
    submissionChannels,
    undefined,
    submissionChannels,
  ];
  for (const [index, channels] of selections.entries()) {
    const person = {
      first: "ทดสอบช่องทาง" + index,
      last: "ตัวกรอง",
      village: 1,
      disabilities: [],
      submissionChannels: channels,
      requests: [],
    };
    fixture.sql(
      `INSERT INTO people(id,village,data) VALUES('filter-${index}',1,'${JSON.stringify(person).replaceAll("'", "''")}');`,
    );
  }
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.request.post(worker.origin + "/api/login", {
    data: { username: "filter-qa", password },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(worker.origin);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  const count = (value) =>
    page.getByText(`ทั้งหมด ${value} รายการ`, { exact: true });
  const select = page.getByLabel("แหล่งที่มาของเคส", { exact: true });
  const search = page.getByRole("button", { name: "ค้นหา", exact: true });
  await expect(count(6)).toBeVisible();
  assert.deepEqual(await select.locator("option").allTextContents(), [
    "ทั้งหมด",
    "พม. CARE",
    "สายด่วน พม. 1300",
    "ทั้งสองช่องทาง",
  ]);
  await select.selectOption("care");
  await expect(count(6)).toBeVisible();
  for (const [channel, total, names] of [
    ["care", 2, [0, 1]],
    ["hotline", 1, [2]],
    ["both", 2, [3, 5]],
  ]) {
    await select.selectOption(channel);
    await search.click();
    await expect(count(total)).toBeVisible();
    await expect(page.locator(".results tbody tr")).toHaveCount(total);
    for (const index of names)
      await expect(
        page.getByRole("button", {
          name: "ดู ทดสอบช่องทาง" + index,
          exact: true,
        }),
      ).toBeVisible();
  }
  const paged = await (
    await context.request.get(
      worker.origin + "/api/people?channel=both&size=1&page=2",
    )
  ).json();
  assert.equal(paged.total, 2);
  assert.deepEqual(
    paged.items.map((p) => p.id),
    ["filter-5"],
  );
  assert.equal(
    (
      await context.request.get(
        worker.origin + "/api/people?channel=constructor",
      )
    ).status(),
    400,
  );
  await page
    .locator(".filters")
    .screenshot({ path: "/tmp/bs-sams-channel-filter-desktop.png" });
  for (const [label, extension] of [
    ["CSV", "csv"],
    ["EXCEL", "xlsx"],
    ["PDF", "pdf"],
  ]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = `/tmp/bs-sams-channel-filter.${extension}`;
    await (await pending).saveAs(file);
    if (extension === "pdf") {
      const text = execFileSync("pdftotext", ["-raw", file, "-"], {
        encoding: "utf8",
      }).replace(/[\s\u200b]/g, "");
      for (const index of [3, 5])
        assert.ok(text.includes("ทดสอบช่องทาง" + index));
      for (const index of [0, 1, 2, 4])
        assert.ok(!text.includes("ทดสอบช่องทาง" + index));
    } else {
      const workbook = new ExcelJS.Workbook();
      const sheet =
        extension === "csv"
          ? await workbook.csv.readFile(file, { map: (value) => value })
          : (await workbook.xlsx.readFile(file)).worksheets[0];
      assert.equal(sheet.rowCount, 3);
      const nameColumn = sheet.getRow(1).values.indexOf("ชื่อ");
      assert.deepEqual(
        [2, 3].map((row) => sheet.getRow(row).getCell(nameColumn).value),
        ["ทดสอบช่องทาง3", "ทดสอบช่องทาง5"],
      );
    }
  }
  await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
  await expect(select).toHaveValue("");
  await expect(count(6)).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await select.selectOption("hotline");
  await search.click();
  await expect(count(1)).toBeVisible();
  await page
    .locator(".filters")
    .screenshot({ path: "/tmp/bs-sams-channel-filter-mobile.png" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all channel filters, legacy data, exclusive matching, apply/reset, API pagination and validation, filtered CSV/Excel/PDF, desktop/mobile, no runtime errors",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
