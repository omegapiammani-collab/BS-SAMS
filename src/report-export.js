import { categories, monthLabel } from "./domain.js";
import { formatThaiDate } from "./thai-date.js";
export function reportExport(sum, config, range, type, section) {
  const metadata = [
    ["ช่วงวันที่", ...range.map(formatThaiDate)],
    ["ขอบเขตข้อมูล", "เฉพาะหมู่บ้านที่มีสิทธิ์ดูและส่งออก"],
    [],
  ];
  if (section === "monthly")
    return {
      name: "รายละเอียดรายเดือน",
      rows: [
        ...metadata,
        [
          "เดือน",
          "ผู้ยื่นคำขอ (คน)",
          "คำขอ (รายการ)",
          "ผู้ได้รับความช่วยเหลือ (คน)",
          "ช่วยเหลือ (ครั้ง)",
          "จำนวนเงิน (บาท)",
        ],
        ...sum.monthly.map((m) => [
          monthLabel(m.month),
          m.requestedPeople,
          m.requested,
          m.helpedPeople,
          m.helped,
          m.amount,
        ]),
      ],
    };
  const village = type === "village";
  const categoryRows = categories.flatMap((category, index) => {
    const types = (sum.assistanceTypes || []).filter(
      (item) => item.category === index,
    );
    return types.length
      ? types.map((item) => [category, item.type, item.people])
      : [[category, "", sum.category[index] || 0]];
  });
  return {
    name: village
      ? "จำนวนผู้ประสบปัญหารายหมู่บ้าน"
      : "จำนวนผู้ประสบปัญหาตามประเภทความช่วยเหลือ",
    rows: [
      ...metadata,
      village
        ? ["หมู่บ้าน", "จำนวนคน"]
        : ["หมวดหมู่", "ประเภทความช่วยเหลือ", "จำนวนคน"],
      ...(village
        ? config.villages.map((v) => [
            `หมู่ ${v.id} บ้าน${v.name}`,
            sum.villages[v.id] || 0,
          ])
        : categoryRows),
      [],
      ["ยอดรวมผู้ยื่นคำขอ", sum.people],
      ["ผู้ได้รับความช่วยเหลือจริง", sum.helpedPeople],
      ["จำนวนครั้งช่วยเหลือ", sum.helpedEvents],
    ],
  };
}
