export const auditActions = {
  "confirm-distinct-person": "ยืนยันเพิ่มบุคคลแยกจากรายการที่อาจซ้ำ",
  "create-person": "เพิ่มทะเบียนบุคคล",
  "update-person": "แก้ไขทะเบียนบุคคล",
  "delete-request": "ลบคำขอความช่วยเหลือ",
  "delete-assistance": "ลบประวัติการช่วยเหลือ",
  "delete-person": "ย้ายทะเบียนเข้าถังขยะ",
  "purge-person": "ลบทะเบียนบุคคลถาวร",
  restore: "กู้คืนทะเบียนบุคคล",
  "export-person": "ส่งออกรายละเอียดรายบุคคล",
  export: "ส่งออกทะเบียนบุคคล",
  "export-report": "ส่งออกรายงานสรุป",
  "create-user": "สร้างบัญชีผู้ใช้งาน",
  "update-user": "แก้ไขบัญชีและสิทธิ์",
  "reset-password": "ผู้ดูแลรีเซ็ตรหัสผ่าน",
  "change-password": "เปลี่ยนรหัสผ่าน",
  "update-config": "แก้ไขการตั้งค่าระบบ",
};
export function auditTarget(target) {
  return target === "system"
    ? "การตั้งค่าระบบ"
    : target === "summary"
      ? "รายงานสรุป"
      : target === "people"
        ? "ทะเบียนบุคคล"
        : target;
}
