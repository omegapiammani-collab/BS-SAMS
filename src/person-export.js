import {
  age,
  categories,
  personLabels,
  personStatus,
  statuses,
  requestReasonLabel,
  closed,
} from "./domain.js";
import { formatThaiDate } from "./thai-date.js";
import { formatMoney, sumMoney, thailandDate } from "./money.js";
import { orderRequests } from "./request-order.js";
export const personPdfOptions = {
  orientation: "portrait",
  columnWeights: [1, 2],
  thaiWordWrapColumns: [0, 1],
  keepSectionsTogether: true,
  keepWithHeaderRows: 1,
};
export function personExport(person, config) {
  const village = config.villages.find((v) => v.id === Number(person.village));
  const rows = [
    ["ข้อมูลผู้ประสบปัญหา", "รายละเอียด"],
    ["ชื่อ–นามสกุล", `${person.title || ""}${person.first} ${person.last}`],
    ["เลขบัตรประชาชน", person.nationalId || ""],
    ["วันเกิด", formatThaiDate(person.birth) || ""],
    ["อายุ", person.birth ? `${age(person.birth, thailandDate())} ปี` : ""],
    ["สถานภาพสมรส", person.marital || ""],
    [
      "ความพิการ",
      person.disabilities.length
        ? person.disabilities.join(", ")
        : "ไม่มีความพิการ",
    ],
    ["แหล่งที่มาของเคส", (person.submissionChannels || []).join("\n")],
    ["โทรศัพท์", person.phone || ""],
    ["รหัสประจำบ้าน", person.houseCode || ""],
    ["บ้านเลขที่", person.house || ""],
    [
      "หมู่บ้าน",
      `หมู่ ${person.village}${village ? ` บ้าน${village.name}` : ""}`,
    ],
    ["สถานะรวม", personLabels[personStatus(person)]],
    ["จำนวนคำขอ", person.requests.length],
    [
      "รวมเงินช่วยเหลือ (บาท)",
      formatMoney(sumMoney(person.requests.flatMap((r) => r.payments))),
    ],
  ];
  const ordered = categories.flatMap((_, index) =>
    orderRequests(person.requests.filter((r) => Number(r.category) === index)),
  );
  for (const [index, request] of ordered.entries()) {
    rows.push(
      [],
      [`คำขอที่ ${index + 1}`, categories[Number(request.category)]],
      ["ประเภทความช่วยเหลือ", request.type],
      ["วันที่ยื่นคำขอ", formatThaiDate(request.date)],
      ["สถานะคำขอ", statuses[request.status]],
      ["สภาพปัญหาและรายละเอียดคำขอ", request.note || ""],
    );
    if (closed.includes(request.status))
      rows.push([requestReasonLabel(request.status), request.reason || ""]);
    else if (request.reason) rows.push(["หมายเหตุสถานะคำขอ", request.reason]);
    for (const [childIndex, child] of (request.children || []).entries())
      rows.push(
        [],
        [
          "บุตรหรือเด็กในความอุปการะ",
          `คนที่ ${childIndex + 1} ของคำขอที่ ${index + 1}`,
        ],
        ["ชื่อ–นามสกุล", `${child.title}${child.first} ${child.last}`],
        ["เลขบัตรประชาชน", child.nationalId],
        ["วันเกิด", formatThaiDate(child.birth) || ""],
        ["อายุ", child.birth ? `${age(child.birth)} ปี` : ""],
        [
          "ความพิการ",
          child.disabilities.length
            ? child.disabilities.join(", ")
            : "ไม่มีความพิการ",
        ],
      );
    if (!request.payments.length)
      rows.push(
        [],
        ["ประวัติการช่วยเหลือ", `ของคำขอที่ ${index + 1}`],
        ["สถานะการช่วยเหลือ", "ยังไม่มีการช่วยเหลือ"],
      );
    for (const [number, payment] of request.payments.entries())
      rows.push(
        [],
        [
          "ประวัติการช่วยเหลือ",
          `รายการที่ ${number + 1} ของคำขอที่ ${index + 1}`,
        ],
        ["วันที่ได้รับการช่วยเหลือ", formatThaiDate(payment.date)],
        ["หน่วยงานผู้ให้", payment.provider],
        ["จำนวนเงิน (บาท)", formatMoney(payment.amount)],
        [
          "จำนวนสิ่งของ",
          payment.quantity !== undefined &&
          payment.quantity !== null &&
          payment.quantity !== ""
            ? `${payment.quantity}${payment.unit ? ` ${payment.unit}` : ""}`
            : "",
        ],
        ["รายละเอียดความช่วยเหลือ", payment.detail || ""],
      );
  }
  return rows;
}
