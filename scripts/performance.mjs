import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import ExcelJS from "exceljs";
import { hashPassword } from "../server/auth.js";
import { localFixture, startWorker } from "./local-fixture.mjs";
const { values } = parseArgs({
  options: {
    sizes: { type: "string", default: "1000,10000" },
    "pdf-rows": { type: "string", default: "1000" },
    samples: { type: "string", default: "5" },
    "output-dir": { type: "string", default: "/tmp/bs-sams-performance" },
  },
});
const sizes = values.sizes.split(",").map(Number);
const pdfRows = Number(values["pdf-rows"]),
  samples = Number(values.samples);
assert.ok(
  sizes.length &&
    sizes.every(
      (size) => Number.isInteger(size) && size >= 100 && size <= 100000,
    ),
);
assert.ok(Number.isInteger(pdfRows) && pdfRows > 0 && pdfRows <= 10000);
assert.ok(Number.isInteger(samples) && samples >= 3 && samples <= 20);
const directory = resolve(values["output-dir"]);
mkdirSync(directory, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  environment: "isolated local Worker/D1 + Chromium; synthetic records only",
  samples,
  budgetsMs: { listP95: 500, summaryP95: 2000, registryPdf: 30000 },
  scenarios: [],
};
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-precise-memory-info"],
});
report.runtime = {
  node: process.version,
  platform: process.platform,
  chromium: await browser.version(),
};
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
try {
  for (const size of sizes) {
    const fixture = localFixture();
    let worker, context;
    try {
      console.log(`Preparing ${size} active synthetic records`);
      fixture.migrate();
      const password = "Aa1!" + randomUUID();
      const rows = [
        `INSERT INTO users VALUES('perf-admin','perf-admin','ผู้ดูแลทดสอบประสิทธิภาพ',${quote(await hashPassword(password))},'admin','[]','[]',0,1);`,
      ];
      const trash = Math.ceil(size / 20),
        subset = Math.min(pdfRows, size);
      for (let i = 0; i < size + trash; i++) {
        const id = `perf-${String(i).padStart(6, "0")}`;
        const person = {
          id,
          title: "นาย",
          first: `${i < subset ? "PDFทดสอบ" : "ข้อมูลจำลอง"}${String(i).padStart(6, "0")}`,
          last: "ทดสอบประสิทธิภาพ",
          nationalId: "",
          birth: "1990-01-01",
          marital: "โสด",
          disabilities: [],
          phone: "",
          houseCode: "",
          house: String(i + 1),
          village: (i % 17) + 1,
          createdAt: "2026-10-01T00:00:00.000Z",
          requests: [
            {
              id: `r-${i}-1`,
              category: "0",
              type: "เงินสงเคราะห์ทดสอบ",
              date: "2026-10-01",
              status: "done",
              reason: "",
              note: "ข้อมูลจำลองสำหรับทดสอบเท่านั้น",
              payments: [
                {
                  id: `pay-${i}`,
                  date: "2026-10-02",
                  provider: "หน่วยงานจำลอง",
                  amount: 100,
                  quantity: "",
                  unit: "",
                  detail: "",
                },
              ],
            },
            {
              id: `r-${i}-2`,
              category: "1",
              type: "ซ่อมบ้านทดสอบ",
              date: "2026-10-03",
              status: "pending",
              reason: "",
              note: "",
              payments: [],
            },
          ],
        };
        rows.push(
          `INSERT INTO people(id,village,data,deleted_at) VALUES(${quote(id)},${person.village},${quote(JSON.stringify(person))},${i < size ? "NULL" : "'2026-10-04T00:00:00Z'"});`,
        );
      }
      fixture.sql(rows.join("\n"));
      worker = await startWorker(fixture.state);
      context = await browser.newContext({
        viewport: { width: 1536, height: 1024 },
      });
      const login = await context.request.post(worker.origin + "/api/login", {
        data: { username: "perf-admin", password },
      });
      assert.equal(login.status(), 200);
      const scenario = {
        activePeople: size,
        trashedPeople: trash,
        activeRequests: size * 2,
        activeAssistance: size,
        api: {},
        browser: {},
        exports: {},
      };
      async function request(path, data) {
        const begin = performance.now();
        const response = await context.request.fetch(
          worker.origin + "/api" + path,
          { method: data ? "POST" : "GET", data },
        );
        const body = await response.body();
        assert.equal(response.status(), 200, `${path} failed`);
        return {
          ms: performance.now() - begin,
          bytes: body.length,
          data: JSON.parse(body.toString()),
        };
      }
      async function measure(name, path, body, check) {
        const timings = [];
        let bytes;
        for (let i = 0; i < samples; i++) {
          const response = await request(path, body);
          check(response.data);
          timings.push(response.ms);
          bytes = response.bytes;
        }
        const sorted = [...timings].sort((a, b) => a - b);
        scenario.api[name] = {
          samplesMs: timings.map(Math.round),
          medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
          p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
          responseBytes: bytes,
        };
      }
      const range = { from: "2026-10-01", to: "2027-09-30" };
      await measure(
        "registryFirstPage",
        "/people?size=25",
        undefined,
        (data) => {
          assert.equal(data.total, size);
          assert.equal(data.items.length, 25);
        },
      );
      await measure(
        "registryLastPage",
        `/people?size=25&page=${Math.ceil(size / 25)}`,
        undefined,
        (data) => assert.equal(data.total, size),
      );
      await measure(
        "filteredRegistry",
        "/people?size=25&status=partial&cat=0&q=ทดสอบ",
        undefined,
        (data) => assert.equal(data.total, size),
      );
      const checkSummary = (data) => {
        assert.equal(data.people, size);
        assert.equal(data.requests, size * 2);
        assert.equal(data.helpedPeople, size);
        assert.equal(data.amount, size * 100);
      };
      await measure(
        "summary",
        `/summary?from=${range.from}&to=${range.to}`,
        undefined,
        checkSummary,
      );
      await measure("reportExport", "/report-export", range, checkSummary);
      const concurrentStart = performance.now();
      const concurrent = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(`/summary?from=${range.from}&to=${range.to}`),
        ),
      );
      concurrent.forEach((result) => checkSummary(result.data));
      scenario.api.fiveConcurrentReports = {
        totalMs: Math.round(performance.now() - concurrentStart),
        maxRequestMs: Math.round(Math.max(...concurrent.map((r) => r.ms))),
      };
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.setDefaultTimeout(120000);
      const metrics = await context.newCDPSession(page);
      await metrics.send("Performance.enable");
      let peakHeap = 0;
      const heapTimer = setInterval(async () => {
        try {
          const { metrics: readings } = await metrics.send(
            "Performance.getMetrics",
          );
          peakHeap = Math.max(
            peakHeap,
            readings.find((r) => r.name === "JSHeapUsedSize")?.value || 0,
          );
        } catch {}
      }, 250);
      try {
        let begin = performance.now();
        await page.goto(worker.origin);
        await page
          .getByRole("heading", { name: "ภาพรวมการช่วยเหลือ", exact: true })
          .waitFor();
        await page.locator(".metric strong").first().waitFor();
        scenario.browser.dashboardMs = Math.round(performance.now() - begin);
        begin = performance.now();
        await page
          .getByRole("navigation")
          .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
          .click();
        await page
          .getByText(`ทั้งหมด ${size} รายการ`, { exact: true })
          .waitFor();
        scenario.browser.registryMs = Math.round(performance.now() - begin);
        async function download(format, scope, name, count) {
          const begin = performance.now();
          const pending = page.waitForEvent("download", { timeout: 120000 });
          await scope
            .getByRole("button", { name: format, exact: true })
            .click();
          const result = await pending;
          const path = join(
            directory,
            `${size}-${name}.${format === "EXCEL" ? "xlsx" : format.toLowerCase()}`,
          );
          await result.saveAs(path);
          const entry = {
            rows: count,
            elapsedMs: Math.round(performance.now() - begin),
            bytes: statSync(path).size,
          };
          if (format === "EXCEL") {
            const book = new ExcelJS.Workbook();
            await book.xlsx.readFile(path);
            assert.equal(book.worksheets[0].rowCount, count + 1);
          } else if (format === "CSV")
            assert.equal(
              readFileSync(path, "utf8").trim().split("\n").length,
              count + 1,
            );
          else {
            assert.equal(readFileSync(path).subarray(0, 5).toString(), "%PDF-");
            const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
            entry.pages = Number(info.match(/^Pages:\s+(\d+)/m)[1]);
            const text = execFileSync("pdftotext", ["-raw", path, "-"], {
              encoding: "utf8",
              maxBuffer: 32 * 1024 * 1024,
            }).replace(/\s/g, "");
            if (name === "registry-subset") {
              assert.ok(text.includes("PDFทดสอบ000000"));
              entry.verifiedPeople = new Set(
                text.match(/PDFทดสอบ[0-9]{6}/g) || [],
              ).size;
              assert.equal(entry.verifiedPeople, count);
              assert.ok(
                text.includes(`PDFทดสอบ${String(count - 1).padStart(6, "0")}`),
              );
            }
          }
          return entry;
        }
        scenario.exports.registryCsv = await download(
          "CSV",
          page,
          "registry-all",
          size,
        );
        scenario.exports.registryExcel = await download(
          "EXCEL",
          page,
          "registry-all",
          size,
        );
        await page
          .getByLabel("ชื่อ นามสกุล / เลขบัตร / เลขทะเบียน")
          .fill("PDFทดสอบ");
        await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
        await page
          .getByText(`ทั้งหมด ${subset} รายการ`, { exact: true })
          .waitFor();
        scenario.exports.registryPdf = await download(
          "PDF",
          page,
          "registry-subset",
          subset,
        );
        await page
          .getByRole("navigation")
          .getByRole("button", { name: "รายงานและส่งออก", exact: true })
          .click();
        const monthly = page.locator("section.panel").filter({
          has: page.getByRole("heading", {
            name: "รายละเอียดรายเดือน",
            exact: true,
          }),
        });
        await monthly.getByRole("table").waitFor();
        scenario.exports.monthlyPdf = await download(
          "PDF",
          monthly,
          "monthly-report",
          12,
        );
        await page.screenshot({
          path: join(directory, `${size}-reports.png`),
          fullPage: true,
        });
        scenario.browser.peakHeapMiB = Math.round(peakHeap / 1024 / 1024);
        assert.deepEqual(errors, []);
        scenario.browser.pageErrors = errors;
      } finally {
        clearInterval(heapTimer);
      }
      scenario.budgetsPassed = {
        registry:
          scenario.api.registryFirstPage.p95Ms <= report.budgetsMs.listP95,
        reports: scenario.api.summary.p95Ms <= report.budgetsMs.summaryP95,
        registryPdf:
          scenario.exports.registryPdf.elapsedMs <=
          report.budgetsMs.registryPdf,
      };
      report.scenarios.push(scenario);
      writeFileSync(
        join(directory, "results.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
      console.log(JSON.stringify(scenario));
    } finally {
      await context?.close();
      await worker?.stop();
      fixture.cleanup();
    }
  }
} finally {
  await browser.close();
}
console.log(`Performance report: ${join(directory, "results.json")}`);
