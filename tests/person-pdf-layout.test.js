import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import pdfMake from "pdfmake/build/pdfmake.js";
import { personExport, personPdfOptions } from "../src/person-export.js";
import { pdfDocument } from "../src/pdf-document.js";
const normalize = (text) =>
  text
    .replace(/[\s\u200b]/g, "")
    .replace(/ำา/g, "ำ")
    .replace(/ํา/g, "ำ");
const config = { villages: [{ id: 1, name: "ทรายมูล" }] };
const base = {
  title: "นาย",
  first: "ทดสอบ",
  last: "รายบุคคล",
  village: 1,
  birth: "1985-01-01",
  disabilities: [],
  house: "001/12",
  requests: [],
};
const request = (status = "pending", extra = {}) => ({
  id: crypto.randomUUID(),
  category: "0",
  type: "เงินสงเคราะห์เด็กในครอบครัวยากจน",
  date: "2026-10-01",
  status,
  note: "ครอบครัวมีรายได้น้อยและประสบปัญหาทางสังคม ต้องดูแลเด็กในครอบครัว",
  payments: [],
  ...extra,
});
const fonts = { Sarabun: { normal: "regular.ttf", bold: "bold.ttf" } };
const vfs = Object.fromEntries(
  [
    ["regular.ttf", "Sarabun-Regular.ttf"],
    ["bold.ttf", "Sarabun-Bold.ttf"],
  ].map(([key, file]) => [
    key,
    readFileSync(
      new URL(`../src/assets/fonts/${file}`, import.meta.url),
    ).toString("base64"),
  ]),
);
async function inspect(person, verify) {
  const dir = mkdtempSync(join(tmpdir(), "bs-sams-person-layout-"));
  try {
    const doc = pdfDocument(
      personExport(person, config),
      "รายละเอียดผู้ประสบปัญหา",
      personPdfOptions,
    );
    const bytes = await new Promise((resolve) =>
      pdfMake.createPdf(doc, undefined, fonts, vfs).getBuffer(resolve),
    );
    const file = join(dir, "person.pdf");
    writeFileSync(file, bytes);
    const raw = execFileSync("pdftotext", ["-raw", file, "-"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const bounds = execFileSync("pdftotext", ["-bbox", file, "-"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    for (const word of bounds.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g,
    )) {
      assert.ok(
        Number(word[1]) >= 27.99 && Number(word[3]) <= 595.28 - 27.99,
        "Text stays within A4 horizontal margins",
      );
      assert.ok(
        Number(word[2]) >= 0 && Number(word[4]) <= 841.89,
        "Text stays on the page",
      );
    }
    await verify(raw, doc);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("individual PDF preserves Thai words, child sections, payment sections and exact totals", async () => {
  const children = [
    {
      title: "เด็กหญิง",
      first: "เด็กตัวอย่าง",
      last: "ข้อมูลจำลอง",
      nationalId: "",
      birth: "2015-10-01",
      disabilities: [],
    },
  ];
  const payments = Array.from({ length: 8 }, (_, i) => ({
    date: "2026-11-02",
    provider: `PAYMENT${String(i).padStart(3, "0")} หน่วยงานทดสอบ`,
    amount: "3000.30",
    quantity: 0,
    unit: "ชุด",
    detail: "มอบเครื่องอุปโภคบริโภคตามสภาพปัญหาของครอบครัว",
  }));
  const person = {
    ...base,
    requests: [request("done", { children, payments }), request()],
  };
  await inspect(person, (raw, doc) => {
    const text = normalize(raw);
    for (const value of [
      "นายทดสอบรายบุคคล",
      "001/12",
      "01/10/2569",
      "02/11/2569",
      "24,002.40",
      "0ชุด",
      "ยังไม่มีการช่วยเหลือ",
    ])
      assert.ok(text.includes(value), value);
    assert.ok(
      raw.includes("สังคม"),
      "Thai word is not split before its last letter",
    );
    assert.ok(raw.includes("ครอบครัว"), "Thai word remains intact");
    const pages = raw.split("\f");
    assert.ok(
      pages.some(
        (page) =>
          normalize(page).includes("เด็กหญิงเด็กตัวอย่างข้อมูลจำลอง") &&
          normalize(page).includes("01/10/2558") &&
          normalize(page).includes("ไม่มีความพิการ"),
      ),
      "Child identity and details stay on the same page",
    );
    for (let i = 0; i < 8; i++) {
      const marker = `PAYMENT${String(i).padStart(3, "0")}`;
      assert.equal((text.match(new RegExp(marker, "g")) || []).length, 1);
      assert.ok(
        pages.some(
          (page) =>
            page.includes(marker) &&
            normalize(page).includes(`รายการที่${i + 1}ของคำขอที่1`),
        ),
        "Payment heading stays with its details",
      );
    }
    assert.ok(!text.includes("เหตุผลยุติคำขอ"));
    assert.equal(doc.pageSize, "A4");
    assert.equal(doc.pageOrientation, "portrait");
  });
});
test("long individual notes continue across pages without missing content", async () => {
  const phrase =
    "ครอบครัวมีรายได้น้อย ต้องดูแลเด็กในความอุปการะและคนพิการในภาวะยากลำบาก ";
  await inspect(
    {
      ...base,
      requests: [
        request("rejected", {
          note: "จุดเริ่มต้น " + phrase.repeat(120) + " จุดสิ้นสุด",
          reason: "ไม่เข้าเกณฑ์การช่วยเหลือ",
        }),
      ],
    },
    (raw) => {
      const text = normalize(raw);
      assert.ok(text.includes("จุดเริ่มต้น"));
      assert.ok(text.includes("จุดสิ้นสุด"));
      assert.equal((text.match(/ครอบครัว/g) || []).length, 121);
      assert.ok(text.includes("เหตุผลที่ไม่อนุมัติ"));
      assert.ok(text.includes("ไม่เข้าเกณฑ์การช่วยเหลือ"));
      assert.ok(raw.split("\f").length > 2);
    },
  );
});
test("active requests do not acquire a closure label and retained reasons remain visible", () => {
  const rows = personExport(
    {
      ...base,
      requests: [
        request("pending"),
        request("done", { reason: "เหตุผลที่บันทึกไว้" }),
        request("cancelled", { reason: "ผู้ยื่นขอยกเลิก" }),
        request("referred", { reason: "ส่งต่อหน่วยงาน" }),
      ],
    },
    config,
  );
  assert.ok(!rows.some((row) => row[0] === "เหตุผลที่ไม่อนุมัติ"));
  assert.ok(
    rows.some(
      (row) =>
        row[0] === "หมายเหตุสถานะคำขอ" && row[1] === "เหตุผลที่บันทึกไว้",
    ),
  );
  assert.ok(
    rows.some(
      (row) => row[0] === "เหตุผลที่ยกเลิก" && row[1] === "ผู้ยื่นขอยกเลิก",
    ),
  );
  assert.ok(
    rows.some(
      (row) => row[0] === "เหตุผลยุติคำขอ" && row[1] === "ส่งต่อหน่วยงาน",
    ),
  );
});
