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
  if (open.length && open.every((x) => x.status === "done")) return "done";
  if (r.some((x) => x.status === "done" || x.payments?.length))
    return "partial";
  if (!open.length) return "closed";
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
  if (!/^\d{13}$/.test(id)) return false;
  let n = 0;
  for (let i = 0; i < 12; i++) n += Number(id[i]) * (13 - i);
  return (11 - (n % 11)) % 10 === Number(id[12]);
}
export function summarize(people, from, to) {
  const within = (d) => (!from || d >= from) && (!to || d <= to);
  const result = {
    people: 0,
    requests: 0,
    done: 0,
    partial: 0,
    closed: 0,
    amount: 0,
    category: categories.map(() => 0),
    ages: [0, 0, 0, 0],
    villages: {},
    monthly: Array.from({ length: 12 }, () => ({ requested: 0, helped: 0 })),
  };
  for (const p of people) {
    const rs = (p.requests || []).filter((r) => within(r.date));
    if (!rs.length) continue;
    result.people++;
    result.requests += rs.length;
    const s = personStatus({ ...p, requests: rs });
    if (s === "done") result.done++;
    if (s === "partial") result.partial++;
    if (s === "closed") result.closed++;
    const a = age(p.birth, to || undefined);
    if (a !== null) result.ages[a < 18 ? 0 : a < 26 ? 1 : a < 60 ? 2 : 3]++;
    result.villages[p.village] = (result.villages[p.village] || 0) + 1;
    for (let c = 0; c < 7; c++)
      if (rs.some((r) => Number(r.category) === c)) result.category[c]++;
    for (const r of rs)
      result.monthly[(Number(r.date.slice(5, 7)) + 2) % 12].requested++;
  }
  for (const p of people)
    for (const r of p.requests || [])
      for (const payment of r.payments || [])
        if (within(payment.date)) {
          result.amount += Number(payment.amount || 0);
          result.monthly[(Number(payment.date.slice(5, 7)) + 2) % 12].helped++;
        }
  return result;
}
const isDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validatePerson(p, config) {
  if (!p || typeof p !== "object") return "ข้อมูลไม่ถูกต้อง";
  if (
    typeof p.first !== "string" ||
    !p.first.trim() ||
    p.first.length > 100 ||
    typeof p.last !== "string" ||
    !p.last.trim() ||
    p.last.length > 100
  )
    return "กรุณาระบุชื่อและนามสกุล";
  if (!config.villages.some((v) => v.id === Number(p.village)))
    return "หมู่บ้านไม่ถูกต้อง";
  if (p.nationalId && !validNationalId(p.nationalId))
    return "เลขบัตรประชาชนไม่ถูกต้อง";
  if (
    p.birth &&
    (!isDate(p.birth) || p.birth > new Date().toISOString().slice(0, 10))
  )
    return "วันเกิดไม่ถูกต้อง";
  if (
    !Array.isArray(p.disabilities) ||
    p.disabilities.some((d) => !disabilities.includes(d))
  )
    return "ประเภทความพิการไม่ถูกต้อง";
  if (p.phone && !/^0\d{8,9}$/.test(p.phone))
    return "หมายเลขโทรศัพท์ไม่ถูกต้อง";
  if (
    !Array.isArray(p.requests) ||
    p.requests.length > 200 ||
    new Set(p.requests.map((r) => r.id)).size !== p.requests.length
  )
    return "รายการคำขอไม่ถูกต้อง";
  for (const r of p.requests) {
    if (
      !/^[0-6]$/.test(String(r.category)) ||
      !statuses[r.status] ||
      !isDate(r.date) ||
      typeof r.type !== "string" ||
      !r.type.trim()
    )
      return "กรุณาระบุประเภท วันที่ และสถานะคำขอ";
    if (
      closed.includes(r.status) &&
      (typeof r.reason !== "string" || !r.reason.trim())
    )
      return "กรุณาระบุเหตุผลยุติคำขอ";
    if (!Array.isArray(r.payments) || r.payments.length > 200)
      return "ประวัติการช่วยเหลือไม่ถูกต้อง";
    if (r.status === "done" && !r.payments.length)
      return "กรุณาบันทึกการช่วยเหลือก่อนระบุว่าช่วยเหลือแล้ว";
    for (const x of r.payments) {
      if (
        !isDate(x.date) ||
        x.date < r.date ||
        typeof x.provider !== "string" ||
        !x.provider.trim() ||
        typeof x.detail !== "string" ||
        !x.detail.trim() ||
        !Number.isFinite(Number(x.amount || 0)) ||
        !Number.isFinite(Number(x.quantity || 0)) ||
        (!Number(x.amount) && !Number(x.quantity)) ||
        Number(x.amount) < 0 ||
        Number(x.quantity) < 0 ||
        (Number(x.quantity) > 0 && !x.unit?.trim())
      )
        return "กรุณาระบุวันที่หลังยื่นคำขอ หน่วยงาน รายละเอียด และจำนวนพร้อมหน่วยนับ";
    }
  }
  return null;
}
