import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import pdfMake from "pdfmake/build/pdfmake.js";
import { categories } from "../src/domain.js";
import { registryPdfRows, registryPdfOptions } from "../src/registry-export.js";
import { pdfDocument } from "../src/pdf-document.js";

test("registry PDF keeps all seven Thai assistance categories inside page margins", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bs-sams-pdf-layout-"));
  try {
    const rows = registryPdfRows([
      {
        title: "นาย",
        first: "ทดสอบ",
        last: "ข้อมูลยาว",
        birth: "1990-01-01",
        village: 1,
        requests: categories.map((_, category) => ({ category })),
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
    for (const category of categories)
      assert.ok(text.includes(category.replace(/\s/g, "")), category);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
