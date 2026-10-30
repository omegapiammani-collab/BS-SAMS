export function lifecyclePlan(stored, operation, body) {
  if (
    !body ||
    typeof body !== "object" ||
    !Number.isSafeInteger(body.version) ||
    body.version < 1
  )
    return { error: "กรุณาโหลดรายการล่าสุดก่อนทำรายการ", status: 400 };
  if (
    operation === "delete" &&
    (typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.trim().length > 1000)
  )
    return { error: "กรุณาระบุเหตุผลการลบไม่เกิน 1,000 ตัวอักษร", status: 400 };
  if (desiredState(stored, operation)) return { unchanged: true };
  if (body.version !== stored.version)
    return {
      error: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดรายการล่าสุดก่อนทำรายการ",
      status: 409,
    };
  return {
    unchanged: false,
    version: body.version,
    reason: operation === "delete" ? body.reason.trim() : null,
  };
}
export const desiredState = (row, operation) =>
  operation === "delete" ? !!row.deleted_at : !row.deleted_at;
