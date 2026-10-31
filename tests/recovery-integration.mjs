import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";
import { hashPassword } from "../server/auth.js";
import { randomUUID } from "node:crypto";
const fixture = localFixture();
let worker, browser;
const pass = "Aa1!" + randomUUID();
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const person = (first = "สมชาย", village = 1) => ({
  title: "นาย",
  first,
  last: "ใจดี",
  nationalId: "",
  birth: "1965-01-01",
  marital: "โสด",
  disabilities: [],
  phone: "",
  house: "",
  houseCode: "",
  village,
  requests: [],
});
try {
  fixture.migrate();
  const hash = await hashPassword(pass);
  fixture.sql(
    `INSERT INTO users VALUES('a','draft-admin','ผู้ดูแลทดสอบ',${quote(hash)},'admin','[]','[]',0,1);INSERT INTO users VALUES('s','draft-staff','เจ้าหน้าที่ทดสอบ',${quote(hash)},'staff','["view","create","edit","delete","export"]','[1]',0,1);INSERT INTO users VALUES('o','other-staff','เจ้าหน้าที่อื่น',${quote(hash)},'staff','["view","create","edit"]','[2]',0,1);`,
  );
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
      viewport: { width: 1536, height: 1024 },
    }),
    other = await browser.newContext(),
    staff = await browser.newContext();
  async function call(ctx, path, method = "GET", data) {
    const r = await ctx.request.fetch(worker.origin + "/api" + path, {
      method,
      data,
    });
    return { status: r.status(), data: await r.json() };
  }
  for (const [ctx, username] of [
    [context, "draft-admin"],
    [staff, "draft-staff"],
    [other, "other-staff"],
  ])
    assert.equal(
      (await call(ctx, "/login", "POST", { username, password: pass })).status,
      200,
    );
  const original = (await call(context, "/people", "POST", person())).data;
  let check = await call(context, "/people", "POST", person());
  assert.equal(check.status, 409);
  assert.equal(check.data.code, "DUPLICATE_REVIEW");
  assert.equal(check.data.candidates[0].id, original.id);
  assert.equal(
    (
      await call(context, "/people", "POST", {
        ...person(),
        birth: "1966-01-01",
        duplicateReviewToken: check.data.token,
      })
    ).status,
    409,
  );
  const confirmed = await call(context, "/people", "POST", {
    ...person(),
    duplicateReviewToken: check.data.token,
  });
  assert.equal(confirmed.status, 201);
  // Identical private names in another village must not be disclosed to staff.
  const hidden = (
    await call(other, "/people", "POST", person("ชื่อส่วนตัว", 2))
  ).data;
  assert.equal((await call(staff, "/people/" + hidden.id)).status, 403);
  const visible = await call(
    staff,
    "/people",
    "POST",
    person("ชื่อส่วนตัว", 1),
  );
  assert.equal(visible.status, 201);
  check = await call(staff, "/people", "POST", person("ชื่อส่วนตัว", 1));
  assert.equal(check.status, 409);
  assert.ok(check.data.candidates.every((p) => p.village === 1));
  assert.ok(!check.data.candidates.some((p) => p.id === hidden.id));
  assert.equal(
    (
      await call(staff, "/drafts/" + randomUUID(), "PUT", {
        ownerId: "a",
        version: 0,
        data: person(),
      })
    ).status,
    403,
  );
  const draftId = randomUUID();
  const saved = await call(context, "/drafts/" + draftId, "PUT", {
    version: 0,
    data: { ...original, first: "ข้อความร่าง" },
  });
  assert.equal(saved.status, 200);
  assert.equal((await call(other, "/drafts/" + draftId)).status, 410);
  assert.equal((await call(other, "/drafts")).data.items.length, 0);
  assert.equal(
    (
      await call(context, "/drafts/" + draftId, "PUT", {
        version: 0,
        data: original,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(context, "/drafts/" + draftId, "PUT", {
        version: 1,
        data: { ...original, first: "ร่างใหม่" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(context, "/drafts/" + draftId, "DELETE", { version: 1 }))
      .status,
    409,
  );
  assert.equal(
    (await call(context, "/drafts/" + draftId)).data.data.first,
    "ร่างใหม่",
  );
  const changed = await call(context, "/people/" + original.id, "PUT", {
    ...original,
    first: "ข้อมูลล่าสุด",
  });
  assert.equal(changed.status, 200);
  assert.equal((await call(context, "/drafts/" + draftId)).data.conflict, true);
  assert.equal(
    (
      await call(context, "/people/" + original.id, "PUT", {
        ...original,
        draftToDelete: { id: draftId, version: 2 },
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(context, "/drafts/" + draftId)).status,
    200,
    "Failed person saves must retain drafts",
  );
  await call(context, "/drafts/" + draftId, "DELETE", { version: 2 });
  const expiring = randomUUID();
  await call(context, "/drafts/" + expiring, "PUT", {
    version: 0,
    data: person("ร่างหมดอายุ"),
  });
  fixture.sql(
    `UPDATE person_drafts SET expires_at=0 WHERE id=${quote(expiring)};`,
  );
  assert.equal((await call(context, "/drafts/" + expiring)).status, 410);
  assert.ok(
    !(await call(context, "/drafts")).data.items.some((x) => x.id === expiring),
  );
  const scoped = randomUUID();
  await call(staff, "/drafts/" + scoped, "PUT", {
    version: 0,
    data: person("ร่างเจ้าหน้าที่"),
  });
  fixture.sql("UPDATE users SET permissions='[\"view\"]' WHERE id='s';");
  assert.equal((await call(staff, "/drafts")).data.items.length, 0);
  assert.equal((await call(staff, "/drafts/" + scoped)).status, 403);
  fixture.sql(
    'UPDATE users SET permissions=\'["view","create","edit","delete","export"]\' WHERE id=\'s\';',
  );
  const purgeDraft = randomUUID();
  await call(context, "/drafts/" + purgeDraft, "PUT", {
    version: 0,
    data: changed.data,
  });
  await call(context, "/people/" + original.id, "DELETE", {
    reason: "ทดสอบลบถาวร",
  });
  assert.equal((await call(context, "/drafts/" + purgeDraft)).status, 403);
  const trashed = (await call(context, "/people?trash=1")).data.items.find(
    (x) => x.id === original.id,
  );
  assert.equal(
    (
      await call(context, "/people/" + original.id + "/purge", "DELETE", {
        version: trashed.version,
      })
    ).status,
    200,
  );
  assert.equal((await call(context, "/drafts/" + purgeDraft)).status, 410);
  // Exercise durable recovery in a real browser, including incomplete dates and requests.
  let page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(worker.origin);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  await page
    .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
    .click();
  await page.getByLabel("ชื่อ *", { exact: true }).fill("กู้คืนร่างทดสอบ");
  await page.getByLabel("นามสกุล *", { exact: true }).fill("ครบทุกรายการ");
  await page.getByLabel("วันเดือนปีเกิด", { exact: false }).fill("31/02/2569");
  await page
    .getByRole("button", { name: "เพิ่มคำขอ เงินสงเคราะห์", exact: true })
    .click();
  await page
    .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
    .fill("คำขอในร่าง");
  await page.getByText(/เก็บร่างล่าสุดแล้ว เวลา/).waitFor();
  const drafts = (await call(context, "/drafts")).data.items;
  const uiDraft = drafts.find((x) => x.first === "กู้คืนร่างทดสอบ");
  assert.ok(uiDraft);
  assert.equal(
    (await call(context, "/drafts/" + uiDraft.id)).data.data.requests[0].type,
    "คำขอในร่าง",
  );
  await page.close();
  const reopened = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  assert.equal(
    (
      await call(reopened, "/login", "POST", {
        username: "draft-admin",
        password: pass,
      })
    ).status,
    200,
  );
  page = await reopened.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(worker.origin);
  await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "ร่างที่ยังไม่บันทึก", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "กู้คืนร่าง", exact: true })
    .first()
    .click();
  assert.equal(
    await page.getByLabel("ชื่อ *", { exact: true }).inputValue(),
    "กู้คืนร่างทดสอบ",
  );
  assert.equal(
    await page.getByLabel("วันเดือนปีเกิด", { exact: false }).inputValue(),
    "31/02/2569",
  );
  await page.getByLabel("วันเดือนปีเกิด", { exact: false }).fill("01/01/2533");
  await page
    .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("ประเภทความช่วยเหลือ *", { exact: true })
      .inputValue(),
    "คำขอในร่าง",
  );
  await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.ok(
    !(await call(context, "/drafts")).data.items.some(
      (x) => x.id === uiDraft.id,
    ),
  );
  await page.setViewportSize({ width: 1536, height: 1024 });
  // Server draft values must never be written into browser storage.
  assert.deepEqual(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
    { local: [], session: [] },
  );
  await page
    .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
    .click();
  await page.getByLabel("ชื่อ *", { exact: true }).fill("สมชาย");
  await page.getByLabel("นามสกุล *", { exact: true }).fill("ใจดี");
  await page.getByRole("button", { name: "บันทึกข้อมูล", exact: true }).click();
  await page
    .getByRole("dialog", { name: "ตรวจสอบบุคคลที่อาจซ้ำ", exact: true })
    .waitFor();
  await page.screenshot({ path: "/tmp/bs-sams-duplicate-warning.png" });
  await page
    .getByRole("button", { name: "ยืนยันเป็นคนละบุคคลและบันทึก", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "เพิ่มผู้ประสบปัญหา", exact: true })
    .click();
  await page.getByLabel("ชื่อ *", { exact: true }).fill("ร่างที่จะละทิ้ง");
  await page.getByText(/เก็บร่างล่าสุดแล้ว เวลา/).waitFor();
  const discardId = (await call(context, "/drafts")).data.items.find(
    (x) => x.first === "ร่างที่จะละทิ้ง",
  ).id;
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await page
    .getByRole("button", { name: "ละทิ้งการเปลี่ยนแปลง", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "เพิ่มผู้ประสบปัญหาทางสังคม", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal((await call(context, "/drafts/" + discardId)).status, 410);
  const conflictId = randomUUID();
  await call(context, "/drafts/" + conflictId, "PUT", {
    version: 0,
    data: { ...confirmed.data, first: "ร่างก่อนข้อมูลเปลี่ยน" },
  });
  await call(context, "/people/" + confirmed.data.id, "PUT", {
    ...confirmed.data,
    first: "ชื่อในทะเบียนล่าสุด",
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ภาพรวม", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  await page
    .locator(".draft-row")
    .filter({ hasText: "ร่างก่อนข้อมูลเปลี่ยน" })
    .getByRole("button", { name: "กู้คืนร่าง", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "ทะเบียนเปลี่ยนหลังเก็บร่าง", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "ดูร่างแบบอ่านอย่างเดียว", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("ชื่อ *", { exact: true }).inputValue(),
    "ร่างก่อนข้อมูลเปลี่ยน",
  );
  assert.equal(
    await page.getByLabel("ชื่อ *", { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "ส่งออก PDF รายบุคคล", exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: "/tmp/bs-sams-draft-conflict.png" });
  await page
    .getByRole("button", {
      name: "เปิดทะเบียนล่าสุด (เก็บร่างไว้)",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-field="first"]')?.value ===
      "ชื่อในทะเบียนล่าสุด",
  );
  assert.equal(
    await page.getByLabel("ชื่อ *", { exact: true }).inputValue(),
    "ชื่อในทะเบียนล่าสุด",
  );
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await call(context, "/drafts/" + conflictId)).status, 200);
  await page
    .locator(".draft-row")
    .filter({ hasText: "ร่างก่อนข้อมูลเปลี่ยน" })
    .getByRole("button", { name: "ลบร่าง", exact: true })
    .click();
  await page.getByRole("button", { name: "ยืนยันลบร่าง", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await call(context, "/drafts/" + conflictId)).status, 410);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: duplicate review/acknowledgement, scoped candidates, private drafts, expiry, permissions, CAS conflicts, purge cleanup, browser reload recovery including invalid dates, successful-save cleanup, no browser PII storage",
  );
  await reopened.close();
  await context.close();
  await other.close();
  await staff.close();
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
