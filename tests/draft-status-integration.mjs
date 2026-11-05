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
    `INSERT INTO users VALUES('draft-status','draft-status','ทดสอบสถานะร่าง','${await hashPassword(password)}','admin','[]','[]',0,1);`,
  );
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  await context.request.post(worker.origin + "/api/login", {
    data: { username: "draft-status", password },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(worker.origin);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  await page
    .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
    .click();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const name = page.getByLabel("ชื่อ *", { exact: true });
  const status = page.locator(".draft-status");
  await name.fill("ร่างรุ่นแรก");
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let received;
  const written = new Promise((resolve) => {
    received = resolve;
  });
  let draftId;
  await page.route(
    "**/api/drafts/*",
    async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      draftId = new URL(route.request().url()).pathname.split("/").at(-1);
      const response = await route.fetch();
      received();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  const firstRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/drafts/") && request.method() === "PUT",
  );
  await page.clock.runFor(5000);
  await firstRequest;
  await written;
  await name.fill("ร่างรุ่นล่าสุด");
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/drafts/" + draftId) &&
      response.request().method() === "PUT",
  );
  release();
  await (await oldResponse).finished();
  await page.clock.runFor(100);
  // The old write is confirmed, while the latest edit is still waiting in the debounce timer.
  await expect(status).toContainText("กำลังเก็บร่าง");
  assert.equal(await status.getByText(/เก็บร่างล่าสุดแล้ว/).count(), 0);
  const latest = page.waitForResponse(
    (response) =>
      response.url().endsWith("/drafts/" + draftId) &&
      response.request().method() === "PUT",
  );
  await page.clock.runFor(5000);
  await latest;
  await expect(status).toContainText("เก็บร่างล่าสุดแล้ว");
  const stored = await (
    await context.request.get(worker.origin + "/api/drafts/" + draftId)
  ).json();
  assert.equal(stored.data.first, "ร่างรุ่นล่าสุด");
  await name.fill("แก้หลังบันทึกร่าง");
  await expect(status).toContainText("กำลังเก็บร่าง");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: unsaved edits never display a saved status, including an older response arriving during a newer debounce; latest draft reaches D1",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
