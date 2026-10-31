import { toSatang, validMoney, thailandDate } from "./money.js";
export const villageNames = [
  "ทรายมูล",
  "จำค่า",
  "ทรายทอง",
  "ปงอ้อม",
  "เสด็จ",
  "ห้วยยาง",
  "ห้วยน้ำเค็ม",
  "ลูเหนือ",
  "ลูใต้",
  "ทรายทองพัฒนา",
  "ปงชัย",
  "เมาะพัฒนา",
  "ทรายมูลพัฒนา",
  "ห้วยยางพัฒนา",
  "ห้วยหลวงพัฒนา",
  "ห้วยเดื่อพัฒนา",
  "ปงชัยพัฒนา",
];
export const categories = [
  "เงินสงเคราะห์",
  "เงินซ่อมบ้าน",
  "ความช่วยเหลืออื่นจากภาครัฐ",
  "ความช่วยเหลืออื่นจากภาคเอกชน",
  "เงินกู้",
  "เครื่องช่วยความพิการ",
  "อื่น ๆ",
];
export const disabilities = [
  "ความพิการทางการเห็น",
  "ความพิการทางการได้ยินหรือสื่อความหมาย",
  "ความพิการทางการเคลื่อนไหวหรือทางร่างกาย",
  "ความพิการทางจิตใจหรือพฤติกรรม",
  "ความพิการทางสติปัญญา",
  "ความพิการทางการเรียนรู้",
  "ความพิการทางออทิสติก",
];
export const statuses = {
  pending: "ยังไม่ได้ดำเนินการ",
  progress: "อยู่ระหว่างช่วยเหลือ",
  done: "ช่วยเหลือแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ผู้ยื่นยกเลิก",
  referred: "ส่งต่อหน่วยงานอื่น",
};
export function completeAssistedRequests(person, previous = { requests: [] }) {
  return person.requests.map((request) => {
    const saved = previous.requests.find((item) => item.id === request.id);
    const savedPayments = new Set(saved?.payments.map((item) => item.id));
    return request.payments.some((payment) => !savedPayments.has(payment.id))
      ? { ...request, status: "done" }
      : request;
  });
}
export const requestReasonLabel = (status) =>
  status === "rejected"
    ? "เหตุผลที่ไม่อนุมัติ"
    : status === "cancelled"
      ? "เหตุผลที่ยกเลิก"
      : "เหตุผลยุติคำขอ";
export const closed = ["rejected", "cancelled", "referred"];
export const permissions = ["view", "create", "edit", "delete", "export"];
export const permissionLabels = [
  "ดูข้อมูล",
  "เพิ่มข้อมูล",
  "แก้ไขข้อมูล",
  "ลบข้อมูล",
  "ส่งออก",
];
export const defaultConfig = {
  name: "ระบบข้อมูลผู้ประสบปัญหาทางสังคม",
  logo: "",
  villages: villageNames.map((name, i) => ({ id: i + 1, name, active: true })),
  types: categories.map((name, i) => ({
    id: String(i),
    name,
    items:
      i === 0
        ? [
            "เงินช่วยเหลือผู้ประสบปัญหาทางสังคมกรณีฉุกเฉิน",
            "เงินสงเคราะห์เด็กในครอบครัวยากจน",
            "เงินอุดหนุนสงเคราะห์ครอบครัว",
            "เงินสงเคราะห์และฟื้นฟูสมรรถภาพคนพิการ",
            "เงินสงเคราะห์ครอบครัวผู้มีรายได้น้อยและคนไร้ที่พึ่ง",
            "เงินสงเคราะห์ผู้สูงอายุที่อยู่ในภาวะยากลำบาก",
          ]
        : i === 1
          ? [
              "เงินซ่อมแซมบ้านผู้สูงอายุ",
              "เงินซ่อมแซมบ้านคนพิการ",
              "เงินช่วยเหลือและเยียวยาผู้ประสบภัยพิบัติ",
              "โครงการบ้านพอเพียง",
            ]
          : [],
  })),
};
export function age(birth, at = new Date().toISOString().slice(0, 10)) {
  if (!birth) return null;
  const b = new Date(birth + "T00:00:00Z"),
    d = new Date(at + "T00:00:00Z");
  return (
    d.getUTCFullYear() -
    b.getUTCFullYear() -
    (d.getUTCMonth() < b.getUTCMonth() ||
    (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())
      ? 1
      : 0)
  );
}
export function fiscalYear(date = new Date()) {
  return date.getFullYear() + 543 + (date.getMonth() >= 9 ? 1 : 0);
}
export function fiscalRange(year) {
  return [`${year - 544}-10-01`, `${year - 543}-09-30`];
}
export function personStatus(p) {
  const r = p.requests || [];
  if (!r.length) return "none";
  const open = r.filter((x) => !closed.includes(x.status));
  if (r.every((x) => x.status === "done")) return "done";
  if (!open.length) return "closed";
  if (r.some((x) => x.status === "done" || x.payments?.length))
    return "partial";
  if (open.some((x) => x.status === "progress")) return "progress";
  return "pending";
}
export const personLabels = {
  none: "ไม่มีปัญหา",
  pending: "ยังไม่ได้ดำเนินการ",
  progress: "อยู่ระหว่างช่วยเหลือ",
  partial: "ช่วยเหลือแล้วบางส่วน",
  done: "ช่วยเหลือครบแล้ว",
  closed: "ยุติคำขอแล้ว",
};
export function validNationalId(id) {
  if (typeof id !== "string" || !/^[0-9]{13}$/.test(id)) return false;
  let n = 0;
  for (let i = 0; i < 12; i++) n += Number(id[i]) * (13 - i);
  return (11 - (n % 11)) % 10 === Number(id[12]);
}
export function validateReportRange(from, to) {
  if (!isDate(from) || !isDate(to) || from > to)
    return "กรุณาระบุช่วงวันที่ให้ถูกต้อง";
  const months =
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7)) +
    1;
  if (months > 120) return "เลือกช่วงรายงานได้ไม่เกิน 120 เดือน";
  return null;
}
export function monthLabel(month) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(month + "-01T00:00:00Z"));
}
export function summarize(people, from, to) {
  const within = (d) => d >= from && d <= to;
  const monthly = [];
  let year = Number(from.slice(0, 4)),
    month = Number(from.slice(5, 7));
  while (`${year}-${String(month).padStart(2, "0")}` <= to.slice(0, 7)) {
    monthly.push({
      month: `${year}-${String(month).padStart(2, "0")}`,
      requested: 0,
      helped: 0,
      requestedPeople: 0,
      helpedPeople: 0,
      amount: 0,
    });
    month++;
    if (month === 13) {
      month = 1;
      year++;
    }
  }
  const months = new Map(monthly.map((m) => [m.month, m]));
  const applicants = new Map(monthly.map((m) => [m.month, new Set()]));
  const recipients = new Map(monthly.map((m) => [m.month, new Set()]));
  const helpedPeople = new Set();
  const result = {
    people: 0,
    requests: 0,
    done: 0,
    partial: 0,
    closed: 0,
    amount: 0,
    helpedPeople: 0,
    helpedEvents: 0,
    unknownAge: 0,
    category: categories.map(() => 0),
    ages: [0, 0, 0, 0],
    villages: {},
    monthly,
  };
  for (const p of people) {
    const rs = (p.requests || []).filter((r) => within(r.date));
    if (rs.length) {
      result.people++;
      result.requests += rs.length;
      const status = personStatus({ requests: rs });
      if (status === "done") result.done++;
      if (status === "partial") result.partial++;
      if (status === "closed") result.closed++;
      const a = age(p.birth, to);
      if (a !== null) result.ages[a < 18 ? 0 : a < 26 ? 1 : a < 60 ? 2 : 3]++;
      else result.unknownAge++;
      result.villages[p.village] = (result.villages[p.village] || 0) + 1;
      for (let c = 0; c < 7; c++)
        if (rs.some((r) => Number(r.category) === c)) result.category[c]++;
      for (const r of rs) {
        const key = r.date.slice(0, 7);
        months.get(key).requested++;
        applicants.get(key).add(p);
      }
    }
    for (const r of p.requests || [])
      for (const payment of r.payments || [])
        if (within(payment.date)) {
          const key = payment.date.slice(0, 7),
            amount = toSatang(payment.amount);
          if (amount === null) throw new Error("ข้อมูลจำนวนเงินไม่ถูกต้อง");
          result.amount += amount;
          result.helpedEvents++;
          helpedPeople.add(p);
          months.get(key).helped++;
          months.get(key).amount += amount;
          recipients.get(key).add(p);
        }
  }
  result.amount /= 100;
  result.helpedPeople = helpedPeople.size;
  for (const m of monthly) {
    m.amount /= 100;
    m.requestedPeople = applicants.get(m.month).size;
    m.helpedPeople = recipients.get(m.month).size;
  }
  return result;
}
export const isDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validatePerson(p, config, today = thailandDate(), previous) {
  return validatePersonIssue(p, config, today, previous)?.message || null;
}

export function validatePersonIssue(
  p,
  config,
  today = thailandDate(),
  previous,
) {
  if (!p || typeof p !== "object")
    return { message: "ข้อมูลไม่ถูกต้อง", field: null };
  if (
    typeof p.first !== "string" ||
    !p.first.trim() ||
    p.first.length > 100 ||
    typeof p.last !== "string" ||
    !p.last.trim() ||
    p.last.length > 100
  )
    return {
      message: "กรุณาระบุชื่อและนามสกุล",
      field:
        typeof p.first !== "string" || !p.first.trim() || p.first.length > 100
          ? "first"
          : "last",
    };
  if (!config.villages.some((v) => v.id === Number(p.village)))
    return { message: "หมู่บ้านไม่ถูกต้อง", field: "village" };
  if (p.nationalId && !validNationalId(p.nationalId))
    return { message: "เลขบัตรประชาชนไม่ถูกต้อง", field: "nationalId" };
  if (p.birth && (!isDate(p.birth) || p.birth > today))
    return { message: "วันเกิดไม่ถูกต้อง", field: "birth" };
  if (
    !Array.isArray(p.disabilities) ||
    p.disabilities.some((d) => !disabilities.includes(d))
  )
    return { message: "ประเภทความพิการไม่ถูกต้อง", field: null };
  if (p.phone && !/^0\d{8,9}$/.test(p.phone))
    return { message: "หมายเลขโทรศัพท์ไม่ถูกต้อง", field: "phone" };
  if (
    !Array.isArray(p.requests) ||
    p.requests.length > 200 ||
    p.requests.some((r) => !r || typeof r !== "object") ||
    new Set(p.requests.map((r) => r.id)).size !== p.requests.length
  )
    return { message: "รายการคำขอไม่ถูกต้อง", field: null };
  for (const r of p.requests) {
    if (
      !/^[0-6]$/.test(String(r.category)) ||
      !Object.hasOwn(statuses, r.status) ||
      (r.status === "referred" &&
        !previous?.requests?.some(
          (old) => old.id === r.id && old.status === "referred",
        )) ||
      !isDate(r.date) ||
      typeof r.type !== "string" ||
      !r.type.trim()
    )
      return {
        message: "กรุณาระบุประเภท วันที่ และสถานะคำขอ",
        field: `requests.${r.id}.${!isDate(r.date) ? "date" : typeof r.type !== "string" || !r.type.trim() ? "type" : "status"}`,
      };
    if (r.date > today || (p.birth && r.date < p.birth))
      return {
        message: "วันที่ยื่นคำขอต้องไม่อยู่ในอนาคตหรือก่อนวันเกิด",
        field: `requests.${r.id}.date`,
      };
    if (r.reason !== undefined && typeof r.reason !== "string")
      return {
        message: "รูปแบบเหตุผลไม่ถูกต้อง",
        field: `requests.${r.id}.reason`,
      };
    if (!Array.isArray(r.payments) || r.payments.length > 200)
      return { message: "ประวัติการช่วยเหลือไม่ถูกต้อง", field: null };
    if (r.status === "done" && !r.payments.length)
      return {
        message: "กรุณาบันทึกการช่วยเหลือก่อนระบุว่าช่วยเหลือแล้ว",
        field: `requests.${r.id}.status`,
      };
    for (const x of r.payments) {
      if (x && typeof x === "object") {
        if (!validMoney(x.amount))
          return {
            message:
              "จำนวนเงินต้องเป็นศูนย์หรือจำนวนบวก มีทศนิยมไม่เกิน 2 ตำแหน่ง และไม่เกิน 999,999,999.99 บาท",
            field: `requests.${r.id}.payments.${x.id}.amount`,
          };
        if (x.date > today)
          return {
            message: "วันที่ได้รับความช่วยเหลือต้องไม่อยู่ในอนาคต",
            field: `requests.${r.id}.payments.${x.id}.date`,
          };
        if (
          x.quantity !== "" &&
          x.quantity !== undefined &&
          x.quantity !== null &&
          (!["number", "string"].includes(typeof x.quantity) ||
            !Number.isFinite(Number(x.quantity)) ||
            Number(x.quantity) < 0)
        )
          return {
            message: "จำนวนสิ่งของต้องเป็นศูนย์หรือจำนวนบวก",
            field: `requests.${r.id}.payments.${x.id}.quantity`,
          };
      }

      if (
        !x ||
        typeof x !== "object" ||
        !isDate(x.date) ||
        x.date < r.date ||
        typeof x.provider !== "string" ||
        !x.provider.trim() ||
        typeof x.detail !== "string" ||
        !Number.isFinite(Number(x.amount || 0)) ||
        !Number.isFinite(Number(x.quantity || 0)) ||
        (!Number(x.amount) && !Number(x.quantity)) ||
        Number(x.amount) < 0 ||
        Number(x.quantity) < 0 ||
        (Number(x.quantity) > 0 &&
          (typeof x.unit !== "string" || !x.unit.trim()))
      )
        return {
          message: "กรุณาระบุวันที่หลังยื่นคำขอ หน่วยงาน และจำนวนพร้อมหน่วยนับ",
          field:
            !x || typeof x !== "object"
              ? null
              : `requests.${r.id}.payments.${x.id}.${!isDate(x.date) || x.date < r.date ? "date" : typeof x.provider !== "string" || !x.provider.trim() ? "provider" : Number(x.quantity) > 0 && (typeof x.unit !== "string" || !x.unit.trim()) ? "unit" : "amount"}`,
        };
    }
  }
  if (
    p.requests.some(
      (r) =>
        typeof r.id !== "string" ||
        !r.id ||
        r.id.length > 100 ||
        new Set(r.payments.map((x) => x.id)).size !== r.payments.length ||
        r.payments.some(
          (x) => typeof x.id !== "string" || !x.id || x.id.length > 100,
        ),
    )
  )
    return {
      message: "รหัสรายการคำขอหรือการช่วยเหลือไม่ถูกต้องหรือซ้ำ",
      field: null,
    };
  const savedRequests = new Map(
    (previous?.requests || []).map((r) => [r.id, r]),
  );
  for (const request of p.requests) {
    if (request.payments.length <= 1) continue;
    const saved = savedRequests.get(request.id);
    const savedIds = new Set(saved?.payments.map((payment) => payment.id));
    if (
      !saved ||
      request.payments.length > saved.payments.length ||
      request.payments.some((payment) => !savedIds.has(payment.id))
    )
      return {
        message:
          "คำขอหนึ่งรายการบันทึกการช่วยเหลือได้หนึ่งครั้ง หากช่วยเหลืออีกครั้งกรุณาสร้างคำขอใหม่",
        field: `requests.${request.id}.status`,
      };
  }
  return null;
}

export function removedPersonRecords(next, previous) {
  const current = new Map(next.requests.map((r) => [r.id, r]));
  const requests = [];
  const payments = [];
  for (const old of previous.requests) {
    const retained = current.get(old.id);
    if (!retained) requests.push(old.id);
    const ids = new Set(retained?.payments.map((payment) => payment.id));
    for (const payment of old.payments)
      if (!ids.has(payment.id)) payments.push(payment.id);
  }
  return { requests, payments };
}
export function validatePersonUpdate(next, previous) {
  const requests = new Map(next.requests.map((r) => [r.id, r]));
  for (const old of previous.requests) {
    const current = requests.get(old.id);
    if (current && current.category !== old.category)
      return "ไม่สามารถเปลี่ยนหมวดหมู่ของคำขอที่บันทึกแล้ว";
  }
  return null;
}
