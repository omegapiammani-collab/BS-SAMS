import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { hashPassword } from "../server/auth.js";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";

const fixture = localFixture();
const password = "Aa1!" + crypto.randomUUID();
let worker, browser;
try {
  fixture.migrate();
  fixture.sql(
    `INSERT INTO users VALUES('idle-qa','idle-qa','ทดสอบเวลา','${await hashPassword(password)}','admin','[]','[]',0,1);`,
  );
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  for (const blockedStorage of [false, true]) {
    const context = await browser.newContext();
    if (blockedStorage)
      await context.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Storage disabled", "SecurityError");
          },
        });
      });
    const page = await context.newPage();
    const errors = [],
      dialogs = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss();
    });
    await page.clock.install();
    await page.goto(worker.origin);
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("idle-qa");
    await page.locator('input[name="password"]').fill(password);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    const dashboard = page.getByRole("heading", {
      name: "ภาพรวมการช่วยเหลือ",
      exact: true,
    });
    await dashboard.waitFor();
    await page.clock.fastForward(20 * 60 * 1000);
    await page.keyboard.press("Shift");
    await page.clock.fastForward(10 * 60 * 1000);
    assert.equal(await dashboard.isVisible(), true);
    const logout = page.waitForResponse(
      (r) => r.url().endsWith("/api/logout") && r.request().method() === "POST",
    );
    await page.clock.fastForward(20 * 60 * 1000);
    assert.equal((await logout).status(), 200);
    await page
      .getByRole("heading", { name: "เข้าสู่ระบบ", exact: true })
      .waitFor();
    assert.equal(
      (await context.request.get(worker.origin + "/api/me")).status(),
      401,
    );
    assert.deepEqual(dialogs, []);
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `/tmp/bs-sams-idle-${blockedStorage ? "blocked" : "normal"}.png`,
    });
    await context.close();
  }
  console.log(
    "PASS: UI login, activity extends deadline, silent logout at 30 idle minutes, server session revoked, normal and blocked storage, no dialogs or runtime errors",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
