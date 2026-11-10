import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { hashPassword } from "../server/auth.js";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";
const fixture = localFixture();
let browser, worker;
try {
  fixture.migrate();
  const password = "Aa1!" + crypto.randomUUID();
  fixture.sql(
    `INSERT INTO users VALUES('village-qa','village-qa','ทดสอบกราฟหมู่บ้าน','${await hashPassword(password)}','admin','[]','[]',0,1);`,
  );
  const request = (category, type = "ทดสอบ", date = "2026-10-01") => ({
    id: crypto.randomUUID(),
    category: String(category),
    type,
    date,
    status: "pending",
    payments: [],
  });
  const people = [
    {
      village: 1,
      requests: [
        request(0),
        request(0, "อีกประเภท"),
        request(1),
        request(2, "นอกช่วง", "2025-10-01"),
      ],
    },
    { village: 3, requests: [request(1)] },
    { village: 6, requests: [request(0)] },
    { village: 11, requests: [request(4)] },
    { village: 17, requests: [request(5)] },
  ];
  for (const [i, p] of people.entries())
    fixture.sql(
      `INSERT INTO people(id,village,data) VALUES('village-${i}',${p.village},'${JSON.stringify({ ...p, first: "ทดสอบ", last: String(i), disabilities: [] })}');`,
    );
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.request.post(worker.origin + "/api/login", {
    data: { username: "village-qa", password },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(worker.origin);
  const panel = page.locator(".village-panel");
  await expect(panel.locator("select")).toHaveCount(0);
  const count = (village) =>
    panel
      .locator(".village-bars > div")
      .nth(village - 1)
      .locator("strong");
  await expect(count(1)).toHaveText("1");
  await expect(count(3)).toHaveText("1");
  for (const [name, width, height] of [
    ["desktop", 1440, 1100],
    ["tablet", 1180, 820],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await panel.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name + ": no page overflow",
    );
    await panel.screenshot({
      path: `/tmp/bs-sams-village-dropdown-${name}.png`,
    });
  }
  await page.getByLabel("ปีงบประมาณ", { exact: false }).selectOption("2569");
  await expect(count(1)).toHaveText("1");
  await expect(count(3)).toHaveText("0");
  await page.getByLabel("ปีงบประมาณ", { exact: false }).selectOption("2570");
  await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "รายงานและส่งออก", exact: true })
    .click();
  const reportChart = page.getByRole("region", {
    name: "กราฟผู้ประสบปัญหารายหมู่บ้าน",
    exact: true,
  });
  await expect(
    reportChart.getByRole("heading", {
      name: "จำนวนผู้ประสบปัญหารายหมู่บ้าน",
      exact: true,
    }),
  ).toBeVisible();
  const headings = await page.getByRole("heading").allTextContents();
  assert.ok(
    headings.indexOf("จำนวนผู้ประสบปัญหาตามประเภทความช่วยเหลือ") <
      headings.indexOf("จำนวนผู้ประสบปัญหารายหมู่บ้าน"),
  );
  assert.ok(
    headings.indexOf("จำนวนผู้ประสบปัญหารายหมู่บ้าน") <
      headings.indexOf("รายละเอียดรายเดือน"),
  );
  const reportSelect = reportChart.getByLabel("ประเภทความช่วยเหลือ", {
    exact: true,
  });
  await expect(reportSelect).toHaveValue("");
  await expect(reportSelect.locator("option")).toHaveCount(8);
  await reportSelect.selectOption("1");
  await expect(reportChart.locator(".village-bars strong").nth(2)).toHaveText(
    "1",
  );
  await reportSelect.selectOption("2");
  await expect(reportChart.locator(".village-bars strong")).toHaveText(
    Array(17).fill("0"),
  );
  assert.ok(
    !(
      await reportChart.locator(".track i").first().getAttribute("style")
    ).includes("NaN"),
  );
  await reportSelect.selectOption("0");
  await expect(reportChart.locator(".village-bars strong").nth(0)).toHaveText(
    "1",
  );
  for (const format of ["CSV", "EXCEL", "PDF", "JPG"]) {
    const pending = page.waitForEvent("download");
    await reportChart
      .getByRole("button", { name: format, exact: true })
      .click();
    const file = `/tmp/bs-sams-village-chart.${format === "EXCEL" ? "xlsx" : format.toLowerCase()}`;
    await (await pending).saveAs(file);
    if (format === "JPG") {
      const bytes = readFileSync(file);
      assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
      const pixels = await page.evaluate(async (base64) => {
        const img = new Image();
        img.src = "data:image/jpeg;base64," + base64;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const colored = [];
        for (let row = 0; row < 17; row++) {
          const data = ctx.getImageData(
            0,
            (190 + row * 44 + 12) * 2,
            img.width,
            1,
          ).data;
          let purple = 0;
          for (let i = 0; i < data.length; i += 4)
            if (
              data[i] >= 25 &&
              data[i] < 65 &&
              data[i + 1] < 65 &&
              data[i + 2] > 65 &&
              data[i + 2] < 125
            )
              purple++;
          if (purple > 100) colored.push(row + 1);
        }
        return { width: img.width, height: img.height, colored };
      }, bytes.toString("base64"));
      assert.equal(pixels.width, 2400);
      assert.equal(pixels.height, 2004);
      assert.deepEqual(pixels.colored, [1, 6]);
    } else if (format === "PDF") {
      const text = execFileSync("pdftotext", ["-raw", file, "-"], {
        encoding: "utf8",
      }).replace(/\s/g, "");
      assert.ok(text.includes("เงินสงเคราะห์"));
      assert.ok(text.includes("01/10/2569"));
      assert.ok(text.includes("30/09/2570"));
    } else {
      const book = new ExcelJS.Workbook();
      const sheet =
        format === "CSV"
          ? await book.csv.readFile(file)
          : (await book.xlsx.readFile(file)).worksheets[0];
      const data = [];
      sheet.eachRow((row) => {
        if (String(row.getCell(1).value).startsWith("หมู่ "))
          data.push([row.getCell(1).value, Number(row.getCell(2).value)]);
      });
      assert.equal(data.length, 17);
      assert.equal(data[0][1], 1);
      assert.equal(data[2][1], 0);
      assert.equal(data[5][1], 1);
      assert.equal(
        data.reduce((sum, row) => sum + row[1], 0),
        2,
      );
    }
  }
  await expect(reportSelect).toBeEnabled();
  for (const [name, width, height] of [
    ["desktop", 1440, 1100],
    ["tablet", 1180, 820],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await reportChart.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await reportChart.screenshot({
      path: `/tmp/bs-sams-report-village-chart-${name}.png`,
    });
  }
  fixture.sql(
    `INSERT INTO users VALUES('village-staff','village-staff','เจ้าหน้าที่กราฟ','${await hashPassword(password)}','staff','["view","export"]','[1]',0,1);`,
  );
  const staffContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await staffContext.request.post(worker.origin + "/api/login", {
    data: { username: "village-staff", password },
  });
  const staffPage = await staffContext.newPage();
  await staffPage.goto(worker.origin);
  await staffPage
    .getByRole("navigation")
    .getByRole("button", { name: "รายงานและส่งออก", exact: true })
    .click();
  const staffChart = staffPage.getByRole("region", {
    name: "กราฟผู้ประสบปัญหารายหมู่บ้าน",
    exact: true,
  });
  await staffChart
    .getByLabel("ประเภทความช่วยเหลือ", { exact: true })
    .selectOption("0");
  const staffPending = staffPage.waitForEvent("download");
  await staffChart.getByRole("button", { name: "EXCEL", exact: true }).click();
  await (await staffPending).saveAs("/tmp/bs-sams-village-chart-staff.xlsx");
  const staffBook = new ExcelJS.Workbook();
  await staffBook.xlsx.readFile("/tmp/bs-sams-village-chart-staff.xlsx");
  const villageNames = [];
  staffBook.worksheets[0].eachRow((row) => {
    if (String(row.getCell(1).value).startsWith("หมู่ "))
      villageNames.push(row.getCell(1).value);
  });
  assert.deepEqual(villageNames, ["หมู่ 1 บ้านทรายมูล"]);
  const staffJpgPending = staffPage.waitForEvent("download");
  await staffChart.getByRole("button", { name: "JPG", exact: true }).click();
  await (await staffJpgPending).saveAs("/tmp/bs-sams-village-chart-staff.jpg");
  const staffImage = await staffPage.evaluate(async (base64) => {
    const img = new Image();
    img.src = "data:image/jpeg;base64," + base64;
    await img.decode();
    return { width: img.width, height: img.height };
  }, readFileSync("/tmp/bs-sams-village-chart-staff.jpg").toString("base64"));
  assert.deepEqual(staffImage, { width: 2400, height: 596 });
  await staffContext.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real summary, dropdown, deduplication, date ranges, dashboard and report charts, real CSV/Excel/PDF/JPG downloads and bar image pixels, staff village export scope, desktop/tablet/mobile and console",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
