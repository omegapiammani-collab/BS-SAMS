import { age, categories } from "./domain.js";
import { formatThaiDate } from "./thai-date.js";
export const registryPdfOptions = {
  columnWeights: [0.6, 1, 1, 1.1, 0.9, 0.4, 0.6, 0.4, 0.9, 2.3, 1.3],
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
      "ยื่นคำร้องผ่านระบบ",
    ],
    ...people.map((person) => {
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
      return [
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
        (person.submissionChannels || []).join("\n"),
      ];
    }),
  ];
}
