import { age, categories } from "./domain.js";
import { formatThaiDate } from "./thai-date.js";
export const registryPdfOptions = {
  columnWeights: [1, 1, 1, 1.5, 1.2, 0.6, 0.8, 0.6, 1, 1.9, 1.7, 1.5],
};

export function registryExportRows(people, filters = {}) {
  return [
    [
      "คำนำหน้า",
      "ชื่อ",
      "นามสกุล",
      "เลขบัตรประชาชน",
      "วันเดือนปีเกิด",
      "อายุ",
      "บ้านเลขที่",
      "หมู่ที่",
      "โทรศัพท์",
      "ประเภทความช่วยเหลือ",
      "ประเภทข้อมูล",
      "ยื่นคำร้องผ่านระบบ",
    ],
    ...people.flatMap((person) => {
      const selected = person.requests.filter(
        (request) =>
          filters.cat === undefined ||
          filters.cat === "" ||
          String(request.category) === String(filters.cat),
      );
      const types = [
        ...new Set(
          selected.map((request) => categories[Number(request.category)]),
        ),
      ];
      const parent = [
        person.title,
        person.first,
        person.last,
        person.nationalId,
        formatThaiDate(person.birth),
        age(person.birth),
        person.house || "",
        person.village,
        person.phone,
        types.join("\n"),
        "ผู้ยื่นคำขอ",
        (person.submissionChannels || []).join("\n"),
      ];
      const children = selected.flatMap((request) =>
        (request.children || []).map((child) => [
          child.title,
          child.first,
          child.last,
          child.nationalId,
          formatThaiDate(child.birth),
          age(child.birth),
          "",
          "",
          "",
          request.type,
          "บุตรหรือเด็กในความอุปการะ",
          "",
        ]),
      );
      return [parent, ...children];
    }),
  ];
}
