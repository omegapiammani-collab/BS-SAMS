import { validPassword, passwordHelp } from "../src/password-policy.js";
export { validPassword } from "../src/password-policy.js";
import { permissions } from "../src/domain.js";
export function validateAccount(b, config, creating) {
  if (
    !b ||
    typeof b !== "object" ||
    typeof b.username !== "string" ||
    !/^[a-zA-Z0-9._-]{3,50}$/.test(b.username) ||
    typeof b.name !== "string" ||
    !b.name.trim() ||
    b.name.length > 100 ||
    !["admin", "staff"].includes(b.role) ||
    typeof b.active !== "boolean"
  )
    return "ข้อมูลบัญชีผู้ใช้งานไม่ถูกต้อง";
  if (
    !Array.isArray(b.permissions) ||
    b.permissions.some((p) => !permissions.includes(p)) ||
    new Set(b.permissions).size !== b.permissions.length
  )
    return "สิทธิ์การใช้งานไม่ถูกต้อง";
  if (
    !Array.isArray(b.villages) ||
    b.villages.length > 90 ||
    b.villages.some(
      (id) =>
        !Number.isInteger(id) || !config.villages.some((v) => v.id === id),
    ) ||
    new Set(b.villages).size !== b.villages.length
  )
    return "หมู่บ้านที่กำหนดสิทธิ์ไม่ถูกต้อง";
  if (
    b.role === "staff" &&
    b.permissions.some((p) => p !== "view") &&
    !b.permissions.includes("view")
  )
    return "ต้องมีสิทธิ์ดูข้อมูลก่อนกำหนดสิทธิ์อื่น";
  if (b.role === "staff" && b.permissions.length && !b.villages.length)
    return "กรุณาเลือกหมู่บ้านอย่างน้อย 1 หมู่บ้าน";
  if (creating && !validPassword(b.password)) return passwordHelp;
  if (!creating && b.password)
    return "กรุณาใช้ปุ่มรีเซ็ตรหัสผ่านแยกจากการแก้ไขสิทธิ์";
  return null;
}
