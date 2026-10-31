import {
  age,
  categories,
  personLabels,
  personStatus,
  statuses,
  requestReasonLabel,
} from "./domain.js";
import { formatThaiDate } from "./thai-date.js";
import { formatMoney, sumMoney, thailandDate } from "./money.js";
import { orderRequests } from "./request-order.js";
export function personExport(person, config) {
  const village = config.villages.find((v) => v.id === Number(person.village));
  const rows = [
    ["ข้อมูลผู้ประสบปัญหา", "รายละเอียด"],
    ["ชื่อ–นามสกุล", `${person.title || ""}${person.first} ${person.last}`],
    ["เลขบัตรประชาชน", person.nationalId || "ไม่ระบุ"],
    ["วันเกิด", formatThaiDate(person.birth) || "ไม่ระบุ"],
    [
      "อายุ",
      person.birth ? `${age(person.birth, thailandDate())} ปี` : "ไม่ระบุ",
    ],
    ["สถานภาพสมรส", person.marital || "ไม่ระบุ"],
    [
      "ความพิการ",
      person.disabilities.length
        ? person.disabilities.join(", ")
        : "ไม่มีความพิการ",
    ],
    ["โทรศัพท์", person.phone || "ไม่ระบุ"],
    ["รหัสประจำบ้าน", person.houseCode || "ไม่ระบุ"],
    ["บ้านเลขที่", person.house || "ไม่ระบุ"],
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
      ["สภาพปัญหาและรายละเอียดคำขอ", request.note || "ไม่ระบุ"],
      [requestReasonLabel(request.status), request.reason || "ไม่ระบุ"],
    );
    if (!request.payments.length)
      rows.push(["ประวัติการช่วยเหลือ", "ยังไม่มีการช่วยเหลือ"]);
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
          payment.quantity
            ? `${payment.quantity} ${payment.unit || ""}`
            : "ไม่ระบุ",
        ],
        ["รายละเอียดความช่วยเหลือ", payment.detail || "ไม่ระบุ"],
      );
  }
  return rows;
}
