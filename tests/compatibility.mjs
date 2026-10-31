import { chromium } from "@playwright/test";
import { parseArgs } from "node:util";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../server/auth.js";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";
const { values } = parseArgs({
  options: {
    "firefox-binary": { type: "string" },
    "only-firefox": { type: "boolean" },
    "only-zoom": { type: "boolean" },
    geckodriver: { type: "string" },
    "firefox-library-dir": { type: "string" },
    "output-dir": { type: "string", default: "/tmp/bs-sams-compatibility" },
  },
});
assert.ok(
  !(values["only-firefox"] && values["only-zoom"]),
  "Choose only one focused scenario",
);
const output = resolve(values["output-dir"]);
mkdirSync(output, { recursive: true });
const report = {
  testedAt: new Date().toISOString(),
  environment: "isolated local Worker/D1; synthetic records",
  scenarios: [],
  physicalDevices: {
    safariOnIphone: "NOT RUN: no connected iPhone or Safari runtime",
    lowRamAndroid:
      "NOT RUN: CPU/JS heap constraints below are a simulation, not physical device RAM",
  },
};
const fixture = localFixture();
let worker;
const password = "Aa1!" + randomUUID();
const first = "ทดสอบอุปกรณ์0000";
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
async function until(test, message, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
}
try {
  fixture.migrate();
  const rows = [
    `INSERT INTO users VALUES('device-admin','device-admin','ผู้ดูแลทดสอบอุปกรณ์',${quote(await hashPassword(password))},'admin','[]','[]',0,1);`,
  ];
  for (let i = 0; i < 1000; i++) {
    const p = {
      id: `device-${i}`,
      title: "นาย",
      first: `ทดสอบอุปกรณ์${String(i).padStart(4, "0")}`,
      last: "นามสกุลภาษาไทยสำหรับตรวจสอบหน้าจอ",
      nationalId: "",
      birth: "1990-01-01",
      marital: "โสด",
      phone: "",
      house: "1",
      houseCode: "",
      village: (i % 17) + 1,
      disabilities: [],
      requests: [
        {
          id: `request-${i}`,
          category: "0",
          type: "เงินสงเคราะห์ครอบครัวผู้มีรายได้น้อยและคนไร้ที่พึ่ง",
          date: "2026-10-01",
          status: "done",
          note: "",
          reason: "",
          payments: [
            {
              id: `payment-${i}`,
              date: "2026-10-02",
              provider: "หน่วยงานทดสอบ",
              amount: 100,
              quantity: "",
              unit: "",
              detail: "",
            },
          ],
        },
      ],
    };
    rows.push(
      `INSERT INTO people(id,village,data) VALUES(${quote(p.id)},${p.village},${quote(JSON.stringify(p))});`,
    );
  }
  fixture.sql(rows.join("\n"));
  worker = await startWorker(fixture.state);
  for (const scenario of values["only-firefox"]
    ? []
    : [
        { name: "chromium-zoom200", zoom: 2, width: 1536, height: 1024 },
        {
          name: "chromium-phone-constrained",
          width: 320,
          height: 740,
          constrained: true,
        },
        { name: "chromium-tablet", width: 768, height: 1024 },
      ]) {
    if (values["only-zoom"] && !scenario.zoom) continue;
    const profile = mkdtempSync(join(tmpdir(), "bs-sams-browser-profile-"));
    if (scenario.zoom) {
      mkdirSync(join(profile, "Default"));
      const level = Math.log(scenario.zoom) / Math.log(1.2);
      // Default-partition preference keys used by current and older Chromium.
      writeFileSync(
        join(profile, "Default", "Preferences"),
        JSON.stringify({
          partition: {
            default_zoom_level: { x: level, 2130630067: level, 0: level },
          },
        }),
      );
    }
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: "/usr/bin/chromium",
      headless: true,
      viewport: scenario.zoom
        ? null
        : { width: scenario.width, height: scenario.height },
      isMobile: !!scenario.constrained,
      hasTouch: !!scenario.constrained,
      args: [
        "--no-sandbox",
        `--window-size=${scenario.width},${scenario.height}`,
        ...(scenario.constrained
          ? [
              "--js-flags=--max-old-space-size=128",
              "--enable-precise-memory-info",
            ]
          : []),
      ],
    });
    const entry = {
      ...scenario,
      engine: context.browser()?.version() || "Chromium",
      checks: [],
    };
    try {
      const page = await context.newPage();
      async function capture(path, fullPage = false) {
        if (scenario.zoom) {
          // Playwright clipping assumes browser zoom 100%; use the native surface at 200%.
          const cdp = await context.newCDPSession(page);
          const shot = await cdp.send("Page.captureScreenshot", {
            format: "png",
            fromSurface: true,
            captureBeyondViewport: false,
          });
          writeFileSync(path, Buffer.from(shot.data, "base64"));
          await cdp.detach();
        } else await page.screenshot({ path, fullPage });
      }
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(30000);
      if (scenario.constrained) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      const login = await context.request.post(worker.origin + "/api/login", {
        data: { username: "device-admin", password },
      });
      assert.equal(login.status(), 200);
      await page.goto(worker.origin);
      await page
        .getByRole("heading", { name: "ภาพรวมการช่วยเหลือ", exact: true })
        .waitFor();
      await page.locator(".metric strong").first().waitFor();
      entry.viewport = await page.evaluate(() => ({
        innerWidth,
        innerHeight,
        outerWidth,
        devicePixelRatio,
        jsHeapLimitMiB: performance.memory
          ? Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
          : null,
      }));
      if (scenario.zoom) {
        assert.ok(Math.abs(entry.viewport.devicePixelRatio - 2) < 0.01);
        assert.equal(entry.viewport.innerWidth, 768);
        entry.checks.push(
          "Native browser zoom 200% verified by CSS viewport and devicePixelRatio",
        );
      }
      const noOverflow = async () =>
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
        );
      await noOverflow();
      async function nav(label) {
        const button = page
          .getByRole("navigation")
          .getByRole("button", { name: label, exact: true });
        if (
          !(await button.isVisible()) ||
          (await button.evaluate((el) => el.getBoundingClientRect().right <= 0))
        )
          await page
            .getByRole("button", { name: "เปิดเมนู", exact: true })
            .click();
        await button.click();
      }
      await nav("ทะเบียนผู้ประสบปัญหา");
      await page.getByText("ทั้งหมด 1000 รายการ", { exact: true }).waitFor();
      await noOverflow();
      await page
        .getByRole("button", { name: `แก้ไข ${first}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: "ไปที่คำขอที่ 1", exact: true })
        .click();
      await page.waitForFunction(() => {
        const heading = document.querySelector(".request-card h3"),
          dialog = heading.closest("dialog");
        return (
          heading.getBoundingClientRect().top >=
            dialog.querySelector(".modal-head").getBoundingClientRect()
              .bottom &&
          heading.getBoundingClientRect().bottom <
            dialog.querySelector(".modal-actions").getBoundingClientRect().top
        );
      });
      entry.checks.push(
        "Request jump is visible between sticky heading and save actions",
      );
      await page.getByLabel("วันที่ยื่นคำขอ · พ.ศ.", { exact: true }).click();
      const calendar = page.getByRole("dialog", {
        name: "เลือกวันที่ พ.ศ.",
        exact: true,
      });
      await calendar.waitFor();
      const calendarFits = await calendar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1
        );
      });
      assert.ok(calendarFits, `${scenario.name}: calendar exceeds viewport`);
      await calendar
        .getByRole("button", { name: "ยกเลิก", exact: true })
        .click();
      entry.checks.push("Thai calendar opens and fits viewport");
      await page.getByLabel("เลขบัตรประชาชน · ไม่บังคับ").fill("1234567890122");
      await page
        .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
        .click();
      await page.waitForFunction(
        () => document.activeElement?.dataset.field === "nationalId",
      );
      await page
        .getByLabel("เลขบัตรประชาชน · ไม่บังคับ")
        .locator("..")
        .getByRole("alert")
        .waitFor();
      await capture(join(output, `${scenario.name}-form.png`));
      entry.checks.push("Inline validation focuses the invalid field");
      await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
      await page
        .getByRole("button", { name: "ละทิ้งการเปลี่ยนแปลง", exact: true })
        .click();
      const pending = page.waitForEvent("download", { timeout: 90000 });
      await page.getByRole("button", { name: "PDF", exact: true }).click();
      const path = join(output, `${scenario.name}.pdf`);
      await (await pending).saveAs(path);
      assert.equal(readFileSync(path).subarray(0, 5).toString(), "%PDF-");
      entry.pdfPages = Number(
        execFileSync("pdfinfo", [path], { encoding: "utf8" }).match(
          /^Pages:\s+(\d+)/m,
        )[1],
      );
      entry.checks.push("Registry PDF with 1,000 people downloaded");
      await nav("รายงานและส่งออก");
      await page
        .getByRole("heading", { name: "รายละเอียดรายเดือน", exact: true })
        .waitFor();
      await noOverflow();
      const region = page.getByRole("region", {
        name: "ตารางรายละเอียดรายเดือน",
        exact: true,
      });
      await region.focus();
      await page.keyboard.press("ArrowRight");
      await capture(join(output, `${scenario.name}-reports.png`), true);
      entry.checks.push(
        "Reports render with page overflow contained in tables",
      );
      assert.deepEqual(errors, []);
      entry.pageErrors = errors;
      entry.status = "passed";
      report.scenarios.push(entry);
    } catch (error) {
      entry.status = "failed";
      entry.error = error.message;
      report.scenarios.push(entry);
      throw error;
    } finally {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
      writeFileSync(
        join(output, "results.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
    }
  }
  if (values["firefox-binary"] && values.geckodriver) {
    const { testFirefox } = await import("./firefox-compatibility.mjs");
    try {
      report.scenarios.push(
        await testFirefox({
          origin: worker.origin,
          password,
          output,
          binary: values["firefox-binary"],
          driver: values.geckodriver,
          libraryDir: values["firefox-library-dir"],
        }),
      );
    } catch (error) {
      report.scenarios.push(
        error.compatibilityEntry || {
          name: "firefox",
          status: "failed",
          error: error.message,
        },
      );
      throw error;
    }
  } else
    report.scenarios.push({
      name: "firefox",
      status: "not-run",
      reason: "Supply --firefox-binary and --geckodriver",
    });
} finally {
  await worker?.stop();
  fixture.cleanup();
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report, null, 2));
