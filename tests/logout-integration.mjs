import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { hashPassword } from "../server/auth.js";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";
const fixture = localFixture();
let worker, browser;
try {
  fixture.migrate();
  const password = "Aa1!" + crypto.randomUUID();
  fixture.sql(
    `INSERT INTO users VALUES('logout-qa','logout-qa','ทดสอบออกจากระบบ','${await hashPassword(password)}','admin','[]','[]',0,1);`,
  );
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(worker.origin);
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("logout-qa");
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page
    .getByRole("heading", { name: "ภาพรวมการช่วยเหลือ", exact: true })
    .waitFor();
  const second = await context.newPage();
  await second.goto(worker.origin);
  await second
    .getByRole("heading", { name: "ภาพรวมการช่วยเหลือ", exact: true })
    .waitFor();
  await context.route("**/api/logout", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.getByRole("button", { name: /^เมนูผู้ใช้ / }).click();
  await page.getByRole("menuitem", { name: "ออกจากระบบ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await expect(
    second.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  await context.unroute("**/api/logout");
  const invalidated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/logout") &&
      response.request().method() === "POST",
  );
  await page.reload();
  assert.equal((await invalidated).status(), 200);
  await expect(
    page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeVisible();
  assert.equal(
    (await context.request.get(worker.origin + "/api/me")).status(),
    401,
  );
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("logout-qa");
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ภาพรวมการช่วยเหลือ", exact: true }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: logout with failed network clears both tabs, reload revokes remaining server session, login works again, no unhandled errors",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
