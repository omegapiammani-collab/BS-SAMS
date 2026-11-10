import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { chromium, expect } from "@playwright/test";
import { hashPassword } from "../server/auth.js";
import { childAssistanceType, newChild } from "../src/children.js";
import { localFixture, startWorker } from "../scripts/local-fixture.mjs";

const fixture = localFixture();
let worker, browser;
try {
  fixture.migrate();
  const password = "Aa1!" + crypto.randomUUID();
  fixture.sql(`INSERT INTO users VALUES('dates-admin','dates-admin','ทดสอบช่วงวันที่','${await hashPassword(password)}','admin','[]','[]',0,1);
    INSERT INTO users VALUES('dates-staff','dates-staff','เจ้าหน้าที่ทดสอบ','${await hashPassword(password)}','staff','["view","export"]','[1]',0,1);`);
  const request = (category, date, payments, type) => ({
    id: crypto.randomUUID(),
    category,
    date,
    type,
    note: "ข้อมูลจำลองสำหรับทดสอบ",
    status: payments.length ? "done" : "pending",
    payments: payments.map((date) => ({
      id: crypto.randomUUID(),
      date,
      amount: "1000",
      quantity: "",
      unit: "",
      provider: "หน่วยงานตัวอย่าง",
      detail: "ข้อมูลจำลอง",
    })),
  });
  const cases = [
    [
      "a",
      "กมลพร",
      1,
      [request("0", "2026-10-01", ["2026-10-31"], childAssistanceType)],
    ],
    [
      "b",
      "กิตติ",
      1,
      [request("1", "2026-10-31", ["2026-11-05"], "เงินซ่อมแซมบ้านคนพิการ")],
    ],
    [
      "c",
      "จารุวรรณ",
      1,
      [
        request(
          "5",
          "2026-09-30",
          ["2026-10-01"],
          "ไม้เท้าขาวและอุปกรณ์ช่วยการมองเห็น",
        ),
      ],
    ],
    [
      "d",
      "ชาญชัย",
      1,
      [
        request(
          "0",
          "2026-10-15",
          ["2026-11-06"],
          "เงินสงเคราะห์และฟื้นฟูสมรรถภาพคนพิการ",
        ),
      ],
    ],
    [
      "e",
      "ณัฐพร",
      1,
      [
        request("0", "2026-09-30", ["2026-10-15"], "คำขอนอกช่วง"),
        request("1", "2026-10-15", ["2026-11-01"], "เงินซ่อมแซมบ้านผู้สูงอายุ"),
      ],
    ],
    ["f", "ธนกร", 1, []],
    ["g", "ปวีณา", 1, [request("6", "2025-10-01", [], "ความช่วยเหลืออื่น")]],
    [
      "h",
      "มานพ",
      2,
      [request("3", "2026-10-15", ["2026-10-15"], "มอบถุงยังชีพ")],
    ],
    [
      "j",
      "ศิริพร",
      1,
      [
        request(
          "4",
          "2026-10-15",
          ["2026-09-30", "2026-11-01"],
          "เงินกู้ประกอบอาชีพ",
        ),
      ],
    ],
  ];
  cases[0][3][0].children = [
    {
      ...newChild(),
      first: "เด็กตัวอย่าง",
      last: "ข้อมูลจำลอง",
      birth: "2018-01-01",
    },
  ];
  for (const [id, first, village, requests] of cases) {
    const person = {
      title: "นาย",
      first,
      last: "ข้อมูลจำลอง",
      village,
      birth: "1985-01-01",
      disabilities: [],
      house: "001/12",
      phone: "",
      submissionChannels: ["พม. CARE"],
      requests,
    };
    fixture.sql(
      `INSERT INTO people(id,village,data) VALUES('dates-${id}',${village},'${JSON.stringify(person)}');`,
    );
  }
  worker = await startWorker(fixture.state);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1150 },
  });
  await context.request.post(worker.origin + "/api/login", {
    data: { username: "dates-admin", password },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(worker.origin);
  await expect(page).toHaveTitle(/ระบบ|BS-SAMS|ข้อมูล/);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ทะเบียนผู้ประสบปัญหา", exact: true })
    .click();
  const count = (total) =>
    page.getByText(`ทั้งหมด ${total} รายการ`, { exact: true });
  await expect(count(9)).toBeVisible();
  const requested = page.getByRole("group", {
    name: "วันที่ยื่นคำขอ",
    exact: true,
  });
  const received = page.getByRole("group", {
    name: "วันที่ได้รับการช่วยเหลือ",
    exact: true,
  });
  const search = page.getByRole("button", { name: "ค้นหา", exact: true });
  const clear = page.getByRole("button", { name: "ล้างตัวกรอง", exact: true });
  const apiPeople = async (query) =>
    (await context.request.get(worker.origin + "/api/people?" + query)).json();
  const requestRange = "requestFrom=2026-10-01&requestTo=2026-10-31";
  const receivedRange = "receivedFrom=2026-10-01&receivedTo=2026-10-31";
  const ids = (result) => result.items.map((person) => person.id).sort();
  assert.deepEqual(ids(await apiPeople(requestRange)), [
    "dates-a",
    "dates-b",
    "dates-d",
    "dates-e",
    "dates-h",
    "dates-j",
  ]);
  assert.deepEqual(ids(await apiPeople(receivedRange)), [
    "dates-a",
    "dates-c",
    "dates-e",
    "dates-h",
  ]);
  assert.deepEqual(ids(await apiPeople(requestRange + "&" + receivedRange)), [
    "dates-a",
    "dates-h",
  ]);
  assert.deepEqual(
    ids(await apiPeople(requestRange + "&" + receivedRange + "&cat=0")),
    ["dates-a"],
  );
  const paged = await apiPeople(requestRange + "&size=2&page=2");
  assert.equal(paged.total, 6);
  assert.equal(paged.items.length, 2);
  for (const query of [
    "requestFrom=2026-02-30",
    "receivedFrom=2026-10-31&receivedTo=2026-10-01",
  ])
    assert.equal(
      (
        await context.request.get(worker.origin + "/api/people?" + query)
      ).status(),
      400,
    );
  const staff = await browser.newContext();
  await staff.request.post(worker.origin + "/api/login", {
    data: { username: "dates-staff", password },
  });
  const staffPeople = await (
    await staff.request.get(
      worker.origin + "/api/people?" + requestRange + "&" + receivedRange,
    )
  ).json();
  assert.deepEqual(ids(staffPeople), ["dates-a"]);

  await requested
    .getByLabel("ตั้งแต่วันที่", { exact: true })
    .fill("01/10/2569");
  await requested.getByLabel("ถึงวันที่", { exact: true }).fill("31/10/2569");
  await expect(count(9)).toBeVisible();
  await search.click();
  await expect(count(6)).toBeVisible();
  await received
    .getByLabel("ตั้งแต่วันที่", { exact: true })
    .fill("01/10/2569");
  await received.getByLabel("ถึงวันที่", { exact: true }).fill("31/10/2569");
  await search.click();
  await expect(count(2)).toBeVisible();
  for (const [label, extension] of [
    ["CSV", "csv"],
    ["EXCEL", "xlsx"],
    ["PDF", "pdf"],
  ]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = `/tmp/bs-sams-date-filter.${extension}`;
    await (await pending).saveAs(file);
    if (extension === "pdf") {
      const text = execFileSync("pdftotext", ["-raw", file, "-"], {
        encoding: "utf8",
      })
        .replace(/[\s\u200b]/g, "")
        .replace(/ำา/g, "ำ")
        .replace(/ํา/g, "ำ");
      for (const label of [
        "วันที่ยื่นคำขอ",
        "วันที่ได้รับการช่วยเหลือ",
        "ตั้งแต่วันที่01/10/2569",
        "ถึงวันที่31/10/2569",
      ])
        assert.ok(text.includes(label));
      for (const name of ["กมลพร", "มานพ", "เด็กตัวอย่าง"])
        assert.ok(text.includes(name));
      for (const name of ["กิตติ", "ณัฐพร", "จารุวรรณ"])
        assert.ok(!text.includes(name));
    } else {
      const book = new ExcelJS.Workbook();
      const sheet =
        extension === "csv"
          ? await book.csv.readFile(file, { map: (value) => value })
          : (await book.xlsx.readFile(file)).worksheets[0];
      assert.equal(sheet.rowCount, 7);
      assert.equal(sheet.getCell("A1").value, "วันที่ยื่นคำขอ");
      assert.equal(sheet.getCell("A2").value, "วันที่ได้รับการช่วยเหลือ");
      assert.equal(sheet.getCell("B1").value, "ตั้งแต่วันที่ 01/10/2569");
      assert.equal(sheet.getCell("C2").value, "ถึงวันที่ 31/10/2569");
      const column = sheet.getRow(4).values.indexOf("ชื่อ");
      assert.deepEqual(
        [5, 6, 7].map((row) => sheet.getRow(row).getCell(column).value),
        ["กมลพร", "เด็กตัวอย่าง", "มานพ"],
      );
    }
  }
  await clear.click();
  await expect(count(9)).toBeVisible();
  await expect(
    requested.getByLabel("ตั้งแต่วันที่", { exact: true }),
  ).toHaveValue("");
  await expect(received.getByLabel("ถึงวันที่", { exact: true })).toHaveValue(
    "",
  );
  await requested
    .getByLabel("ตั้งแต่วันที่", { exact: true })
    .fill("31/02/2569");
  await search.click();
  await expect(count(9)).toBeVisible();
  await expect(
    requested.getByLabel("ตั้งแต่วันที่", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await clear.click();
  await expect(
    requested.getByLabel("ตั้งแต่วันที่", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByText("กรอกวันที่เป็น วัน/เดือน/ปี พ.ศ. เช่น 30/10/2569", {
      exact: true,
    }),
  ).toHaveCount(0);

  for (const group of [requested, received]) {
    await group.getByLabel("ตั้งแต่วันที่", { exact: true }).fill("01/10/2569");
    await group.getByLabel("ถึงวันที่", { exact: true }).fill("30/09/2570");
  }
  await search.click();
  await expect(count(6)).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  for (const [label, width, height] of [
    ["desktop", 1600, 1150],
    ["tablet", 1180, 1100],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const layout = await page
      .locator(".registry-layout")
      .evaluate((element) => {
        const filters = element
          .querySelector(".filters")
          .getBoundingClientRect();
        const results = element
          .querySelector(".results")
          .getBoundingClientRect();
        return {
          filterBottom: filters.bottom,
          resultTop: results.top,
          filterLeft: filters.left,
          resultLeft: results.left,
          filterWidth: filters.width,
          resultWidth: results.width,
        };
      });
    assert.ok(layout.filterBottom <= layout.resultTop);
    assert.ok(Math.abs(layout.filterLeft - layout.resultLeft) < 1);
    assert.ok(Math.abs(layout.filterWidth - layout.resultWidth) < 1);
    const villageLabel = await page
      .locator(".registry-filter-fields .field")
      .nth(1)
      .locator("label")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
        };
      });
    const dateLabels = await page
      .locator(".registry-date-range legend")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            color: style.color,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          };
        }),
      );
    for (const style of dateLabels) assert.deepEqual(style, villageLabel);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `/tmp/bs-sams-registry-search-${label}.png`,
      fullPage: label === "mobile",
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: top search panel, Thai request/received date ranges, inclusive boundaries, same-request matching, pagination, permissions, invalid dates, clear/reset, filtered CSV/Excel/PDF and desktop/tablet/mobile screenshots",
  );
} finally {
  await browser?.close();
  await worker?.stop();
  fixture.cleanup();
}
