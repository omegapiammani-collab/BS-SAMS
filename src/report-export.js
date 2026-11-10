import { categories, monthLabel } from "./domain.js";
import { formatThaiDate } from "./thai-date.js";
export function villageChartExport(sum, config, range, category = "") {
  const counts =
    category === "" ? sum.villages : sum.villagesByCategory[Number(category)];
  const villages = config.villages.map((village) => [
    `หมู่ ${village.id} บ้าน${village.name}`,
    counts[village.id] || 0,
  ]);
  return {
    name: "จำนวนผู้ประสบปัญหารายหมู่บ้าน",
    pdfOptions: {
      title: "จำนวนผู้ประสบปัญหารายหมู่บ้าน",
      thaiWordWrapColumns: [0],
    },
    rows: [
      ["ช่วงวันที่", ...range.map(formatThaiDate)],
      [
        "ประเภทความช่วยเหลือ",
        category === "" ? "ทั้งหมด" : categories[Number(category)],
      ],
      ["ขอบเขตข้อมูล", "เฉพาะหมู่บ้านที่มีสิทธิ์ดูและส่งออก"],
      [],
      ["หมู่บ้าน", "จำนวนคน"],
      ...villages,
      [],
      ["รวมจำนวนคน", villages.reduce((total, row) => total + row[1], 0)],
    ],
  };
}
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
  const totalRow = (label, count) =>
    village ? [label, "", "", count] : [label, "", count];
  const categoryRows = categories.flatMap((category, index) => {
    const types = (sum.assistanceTypes || []).filter(
      (item) => item.category === index,
    );
    return types.length
      ? types.map((item) => [category, item.type, item.people])
      : [[category, "", sum.category[index] || 0]];
  });
  return {
    ...(village
      ? {
          pdfOptions: {
            thaiWordWrapColumns: [2],
            lineBreakBefore: ["คนพิการ"],
          },
        }
      : {}),
    name: village
      ? "จำนวนผู้ประสบปัญหารายหมู่บ้าน"
      : "จำนวนผู้ประสบปัญหาตามประเภทความช่วยเหลือ",
    rows: [
      ...metadata,
      village
        ? ["หมู่บ้าน", "หมวดหมู่", "ประเภทความช่วยเหลือ", "จำนวนคน"]
        : ["หมวดหมู่", "ประเภทความช่วยเหลือ", "จำนวนคน"],
      ...(village
        ? config.villages.flatMap((v) => {
            const name = `หมู่ ${v.id} บ้าน${v.name}`;
            const types = (sum.villageAssistanceTypes || []).filter(
              (item) => item.village === Number(v.id) && item.people > 0,
            );
            return types.length
              ? types.map((item) => [
                  name,
                  categories[item.category],
                  item.type,
                  item.people,
                ])
              : sum.villages[v.id] > 0
                ? [[name, "", "", sum.villages[v.id]]]
                : [];
          })
        : categoryRows),
      [],
      totalRow("ยอดรวมผู้ยื่นคำขอ", sum.people),
      totalRow("ผู้ได้รับความช่วยเหลือจริง", sum.helpedPeople),
      totalRow("จำนวนครั้งช่วยเหลือ", sum.helpedEvents),
    ],
  };
}
