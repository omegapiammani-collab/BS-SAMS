import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import pdfMake from "pdfmake/build/pdfmake.js";
import { categories, submissionChannels } from "../src/domain.js";
import {
  registryExportRows,
  registryPdfOptions,
} from "../src/registry-export.js";
import { pdfDocument } from "../src/pdf-document.js";
import { newChild, childAssistanceType } from "../src/children.js";
import { disabilities } from "../src/domain.js";

test("registry PDF keeps all seven Thai assistance categories inside page margins", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bs-sams-pdf-layout-"));
  try {
    const rows = registryExportRows([
      {
        title: "นาย",
        first: "ทดสอบ",
        last: "ข้อมูลยาว",
        birth: "1990-01-01",
        house: "001/2",
        village: 1,
        submissionChannels,
        requests: categories.map((_, category) => ({
          category,
          type: childAssistanceType,
          date: "2026-01-01",
          ...(category === 0
            ? {
                children: [
                  {
                    ...newChild(),
                    first: "บุตรทดสอบ",
                    last: "รายละเอียดเด็ก",
                    birth: "2020-01-01",
                    nationalId: "1101700207030",
                    disabilities,
                  },
                ],
              }
            : {}),
        })),
      },
    ]);
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
    const document = pdfDocument(
      rows,
      "ทะเบียนผู้ประสบปัญหา",
      registryPdfOptions,
    );
    const buffer = await new Promise((resolve) =>
      pdfMake.createPdf(document, undefined, fonts, vfs).getBuffer(resolve),
    );
    const file = join(directory, "registry.pdf");
    writeFileSync(file, buffer);
    const bounds = execFileSync("pdftotext", ["-bbox", file, "-"], {
      encoding: "utf8",
    });
    const pageWidth = Number(/<page width="([\d.]+)"/.exec(bounds)[1]);
    const words = [
      ...bounds.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)"/g,
      ),
    ];
    assert.ok(words.length > 0);
    for (const word of words) {
      assert.ok(Number(word[1]) >= 28 - 0.01);
      assert.ok(
        Number(word[3]) <= pageWidth - 28 + 0.01,
        `Text outside right margin: ${word[0]}`,
      );
    }
    const text = execFileSync("pdftotext", ["-raw", file, "-"], {
      encoding: "utf8",
    }).replace(/[\s\u200b]/g, "");
    for (const category of [
      ...categories,
      ...submissionChannels,
      "001/2",
      "บุตรทดสอบ",
      "รายละเอียดเด็ก",
      "01/01/2563",
      "1101700207030",
      childAssistanceType,
    ])
      assert.ok(text.includes(category.replace(/\s/g, "")), category);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("village report PDF wraps a complete Thai word instead of splitting its vowel from its consonant", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bs-sams-thai-wrap-"));
  try {
    const type = "เงินสงเคราะห์ผู้สูงอายุที่อยู่ในภาวะยากลำบาก";
    const rows = [
      ["หมู่บ้าน", "หมวดหมู่", "ประเภทความช่วยเหลือ", "จำนวนคน"],
      ["หมู่ 1 บ้านทรายมูล", "เงินสงเคราะห์", type, 1],
    ];
    const fonts = { Sarabun: { normal: "regular.ttf", bold: "bold.ttf" } };
    const vfs = Object.fromEntries(
      [
        ["regular.ttf", "Sarabun-Regular.ttf"],
        ["bold.ttf", "Sarabun-Bold.ttf"],
      ].map(([key, name]) => [
        key,
        readFileSync(
          new URL(`../src/assets/fonts/${name}`, import.meta.url),
        ).toString("base64"),
      ]),
    );
    const buffer = await new Promise((resolve) =>
      pdfMake
        .createPdf(
          pdfDocument(rows, "รายงานรายหมู่บ้าน", { thaiWordWrapColumns: [2] }),
          undefined,
          fonts,
          vfs,
        )
        .getBuffer(resolve),
    );
    const file = join(directory, "report.pdf");
    writeFileSync(file, buffer);
    const lines = execFileSync("pdftotext", ["-raw", file, "-"], {
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((line) => line.replace(/[\s\u200b]/g, "").replace(/ำา/g, "ำ"));
    assert.ok(
      lines.includes("ลำบาก"),
      "ลำบาก must stay together on the new line",
    );
    assert.ok(
      lines.join("").includes(type),
      "All Thai characters must survive rendering",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("registry PDF aligns each category with its type after a preceding type wraps", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bs-sams-pdf-pairs-"));
  try {
    const rows = registryExportRows([
      {
        first: "ทดสอบ",
        last: "จับคู่",
        village: 1,
        requests: [
          { category: "0", type: "เงินสงเคราะห์และฟื้นฟูสมรรถภาพคนพิการ" },
          { category: "1", type: "เงินซ่อมแซมบ้านคนพิการ" },
        ],
      },
    ]);
    const fonts = { Sarabun: { normal: "regular.ttf", bold: "bold.ttf" } };
    const vfs = Object.fromEntries(
      [
        ["regular.ttf", "Sarabun-Regular.ttf"],
        ["bold.ttf", "Sarabun-Bold.ttf"],
      ].map(([key, name]) => [
        key,
        readFileSync(
          new URL(`../src/assets/fonts/${name}`, import.meta.url),
        ).toString("base64"),
      ]),
    );
    const buffer = await new Promise((resolve) =>
      pdfMake
        .createPdf(
          pdfDocument(rows, "ทะเบียนผู้ประสบปัญหา", registryPdfOptions),
          undefined,
          fonts,
          vfs,
        )
        .getBuffer(resolve),
    );
    const file = join(directory, "registry.pdf");
    writeFileSync(file, buffer);
    const bounds = execFileSync("pdftotext", ["-bbox", file, "-"], {
      encoding: "utf8",
    });
    const words = [
      ...bounds.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]+)<\/word>/g,
      ),
    ];
    const category = words.find((word) => word[3] === "เงินซ่อมบ้าน");
    const type = words.find((word) => word[3] === "เงินซ่อมแซมบ้านคนพิการ");
    assert.ok(category && type);
    assert.ok(
      Math.abs(Number(category[2]) - Number(type[2])) < 0.01,
      "Each category/type pair must start on the same baseline",
    );
    assert.ok(Number(category[1]) < Number(type[1]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("multi-page registry PDF keeps each identity and paired assistance together exactly once", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bs-sams-pdf-pages-"));
  try {
    const people = Array.from({ length: 120 }, (_, index) => ({
      title: "นาย",
      first: `PDFทดสอบ${String(index).padStart(6, "0")}`,
      last: "ทดสอบประสิทธิภาพ",
      birth: "1990-01-01",
      village: 1,
      requests: [
        { category: 0, type: "เงินสงเคราะห์ทดสอบ" },
        { category: 1, type: "ซ่อมบ้านทดสอบ" },
      ],
    }));
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
    const buffer = await new Promise((resolve) =>
      pdfMake
        .createPdf(
          pdfDocument(
            registryExportRows(people),
            "ทะเบียน",
            registryPdfOptions,
          ),
          undefined,
          fonts,
          vfs,
        )
        .getBuffer(resolve),
    );
    const file = join(directory, "registry.pdf");
    writeFileSync(file, buffer);
    const pages = execFileSync("pdftotext", ["-raw", file, "-"], {
      encoding: "utf8",
    }).split("\f");
    const names = [];
    for (const page of pages) {
      const text = page.replace(/\s/g, "");
      const matches = [...text.matchAll(/PDFทดสอบ[0-9]{6}/g)].map(
        (match) => match[0],
      );
      names.push(...matches);
      assert.equal(
        (text.match(/เงินสงเคราะห์ทดสอบ/g) || []).length,
        matches.length,
      );
      assert.equal((text.match(/ซ่อมบ้านทดสอบ/g) || []).length, matches.length);
    }
    assert.equal(names.length, people.length);
    assert.equal(new Set(names).size, people.length);
    for (const person of people) assert.ok(names.includes(person.first));
    assert.ok(
      pages.length <= 12,
      "No excessive mostly-empty pages from row spans",
    );
    const history = {
      ...people[0],
      requests: Array.from({ length: 200 }, (_, index) => ({
        category: 0,
        type: `TYPE${String(index).padStart(3, "0")} ${"ช่วยเหลือ".repeat(25)}`,
      })),
    };
    const longBuffer = await new Promise((resolve) =>
      pdfMake
        .createPdf(
          pdfDocument(
            registryExportRows([history]),
            "ประวัติยาว",
            registryPdfOptions,
          ),
          undefined,
          fonts,
          vfs,
        )
        .getBuffer(resolve),
    );
    writeFileSync(file, longBuffer);
    const historyText = execFileSync("pdftotext", ["-raw", file, "-"], {
      encoding: "utf8",
    }).replace(/\s/g, "");
    const types = historyText.match(/TYPE[0-9]{3}/g) || [];
    assert.equal(
      types.length,
      200,
      "Long histories continue onto new pages without clipping",
    );
    assert.equal(new Set(types).size, 200);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
