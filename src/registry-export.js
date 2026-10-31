import { age, categories } from "./domain.js";
import { formatThaiDate } from "./thai-date.js";
export const registryPdfOptions = {
  columnWeights: [0.6, 1, 1, 1.1, 0.9, 0.4, 0.4, 0.9, 2.3],
};

export function registryPdfRows(people, filters = {}) {
  return [
    [
      "คำนำหน้า",
      "ชื่อ",
      "นามสกุล",
      "เลขบัตรประชาชน",
      "วันเดือนปีเกิด",
      "อายุ",
      "หมู่ที่",
      "โทรศัพท์",
      "ประเภทความช่วยเหลือ",
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
        person.village,
        person.phone,
        types.join("\n") || "ไม่ระบุ",
      ];
    }),
  ];
}
