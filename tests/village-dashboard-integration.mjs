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
  const select = panel.getByLabel("ประเภทความช่วยเหลือ", { exact: true });
  await expect(select).toHaveValue("");
  await expect(select.locator("option")).toHaveCount(8);
  const count = (village) =>
    panel
      .locator(".village-bars > div")
      .nth(village - 1)
      .locator("strong");
  await expect(count(1)).toHaveText("1");
  await expect(count(3)).toHaveText("1");
  await select.selectOption("0");
  await expect(count(1)).toHaveText("1");
  await expect(count(3)).toHaveText("0");
  await expect(count(6)).toHaveText("1");
  await select.selectOption("1");
  await expect(count(1)).toHaveText("1");
  await expect(count(3)).toHaveText("1");
  await expect(count(6)).toHaveText("0");
  await select.selectOption("2");
  await expect(panel.locator(".village-bars strong")).toHaveText(
    Array(17).fill("0"),
  );
  assert.ok(
    !(await panel.locator(".track i").first().getAttribute("style")).includes(
      "NaN",
    ),
  );
  await select.selectOption("");
  await expect(count(3)).toHaveText("1");
  const metricsBefore = await page.locator(".metrics").innerText();
  await select.selectOption("0");
  assert.equal(await page.locator(".metrics").innerText(), metricsBefore);
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
  await expect(count(1)).toHaveText("0");
  await expect(select).toHaveValue("0");
  await select.selectOption("2");
  await expect(count(1)).toHaveText("1");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real summary, dropdown, category zero, deduplication, empty category, year changes, isolated chart, desktop/tablet/mobile and console",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
