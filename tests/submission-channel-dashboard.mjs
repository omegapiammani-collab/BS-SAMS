import assert from "node:assert/strict";
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
    `INSERT INTO users VALUES('chart-qa','chart-qa','ทดสอบกราฟ','${await hashPassword(password)}','admin','[]','[]',0,1);`,
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
    const request = {
      id: "r" + index,
      category: "0",
      type: "ทดสอบ",
      date: index === 5 ? "2026-09-30" : "2026-10-01",
      status: "pending",
      payments: [],
    };
    const person = {
      first: "ทดสอบ",
      last: String(index),
      village: 1,
      disabilities: [],
      submissionChannels: channels,
      requests:
        index === 0
          ? [request, { ...request, id: "repeated", date: "2026-10-02" }]
          : [request],
    };
    const data = JSON.stringify(person).replaceAll("'", "''");
    fixture.sql(
      `INSERT INTO people(id,village,data) VALUES('chart-${index}',1,'${data}');`,
    );
  }
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
  });
  await context.request.post(worker.origin + "/api/login", {
    data: { username: "chart-qa", password },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(worker.origin);
  const panel = page.getByRole("region", {
    name: "ยื่นคำร้องผ่านระบบ",
    exact: true,
  });
  await expect(panel.getByRole("img")).toHaveAttribute(
    "aria-label",
    "ผู้ระบุช่องทางทั้งหมด 4 คน",
  );
  for (const [label, value] of [
    [submissionChannels[0], "2 คน (50%)"],
    [submissionChannels[1], "1 คน (25%)"],
    ["ทั้งสองช่องทาง", "1 คน (25%)"],
  ])
    await expect(
      panel
        .locator(".legend > div")
        .filter({ hasText: label })
        .locator("strong"),
    ).toHaveText(value);
  await expect(panel.locator(".panel-note")).toHaveCount(0);
  const gradient = await panel
    .locator(".donut")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  for (const color of [
    "rgb(41, 36, 92)",
    "rgb(57, 166, 221)",
    "rgb(0, 175, 62)",
  ])
    assert.ok(gradient.includes(color), gradient);
  assert.ok(!gradient.includes("NaN"));
  await expect(
    page.getByRole("heading", {
      name: "สถานะปัจจุบันของคำขอในช่วงวันที่",
      exact: true,
    }),
  ).toBeVisible();
  const monthlyPanel = page.locator(".monthly-panel");
  const monthlyBounds = await monthlyPanel.boundingBox();
  const gridBounds = await page.locator(".dashboard-grid").boundingBox();
  assert.ok(Math.abs(monthlyBounds.width - gridBounds.width) < 1);
  assert.ok(
    await monthlyPanel
      .locator(".monthly")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  );
  await monthlyPanel.screenshot({
    path: "/tmp/bs-sams-monthly-full-width.png",
  });
  await page.screenshot({
    path: "/tmp/bs-sams-channel-dashboard-desktop.png",
    fullPage: true,
  });
  await panel.screenshot({ path: "/tmp/bs-sams-channel-donut.png" });
  const year = page.getByLabel("ปีงบประมาณ", { exact: false });
  await year.selectOption("2569");
  await expect(panel.getByRole("img")).toHaveAttribute(
    "aria-label",
    "ผู้ระบุช่องทางทั้งหมด 1 คน",
  );
  await expect(
    panel
      .locator(".legend > div")
      .filter({ hasText: "ทั้งสองช่องทาง" })
      .locator("strong"),
  ).toHaveText("1 คน (100%)");
  await year.selectOption("2571");
  await expect(panel.locator(".panel-note")).toHaveCount(0);
  await expect(panel.getByRole("img")).toHaveAttribute(
    "aria-label",
    "ผู้ระบุช่องทางทั้งหมด 0 คน",
  );
  assert.ok(
    !(await panel.locator(".donut").getAttribute("style")).includes("NaN"),
  );
  await year.selectOption("2570");
  await expect(panel.getByRole("img")).toHaveAttribute(
    "aria-label",
    "ผู้ระบุช่องทางทั้งหมด 4 คน",
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: "/tmp/bs-sams-channel-donut-mobile.png" });
  const bounds = await panel.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 376);
  const monthlyMobile = await monthlyPanel.boundingBox();
  assert.ok(
    monthlyMobile.x >= 0 && monthlyMobile.x + monthlyMobile.width <= 376,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real summary API, exclusive 3-way counts, repeated requests counted once, purple/blue/green, year filter, empty state, desktop/mobile, preserved status chart, no runtime errors",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
