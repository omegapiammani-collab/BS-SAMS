import { categories } from "../src/domain.js";
export function cleanConfig(b, previous) {
  if (
    !b ||
    typeof b !== "object" ||
    typeof b.name !== "string" ||
    !b.name.trim() ||
    b.name.trim().length > 200 ||
    typeof b.logo !== "string" ||
    b.logo.length > 280000 ||
    !Number.isSafeInteger(b.revision) ||
    b.revision < 0
  )
    return { error: "ข้อมูลการตั้งค่าหรือรุ่นข้อมูลไม่ถูกต้อง" };
  if (
    b.logo &&
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(b.logo)
  )
    return { error: "โลโก้ต้องเป็น PNG, JPEG หรือ WebP" };
  if (
    !Array.isArray(b.villages) ||
    !b.villages.length ||
    b.villages.length > 90 ||
    b.villages.some(
      (v) =>
        !v ||
        !Number.isInteger(v.id) ||
        v.id < 1 ||
        v.id > 10000 ||
        typeof v.name !== "string" ||
        !v.name.trim() ||
        v.name.trim().length > 150 ||
        typeof v.active !== "boolean",
    ) ||
    new Set(b.villages.map((v) => v.id)).size !== b.villages.length
  )
    return { error: "ข้อมูลหมู่บ้านไม่ถูกต้องหรือรหัสหมู่บ้านซ้ำ" };
  if (previous.villages.some((v) => !b.villages.some((x) => x.id === v.id)))
    return {
      error: "กรุณาปิดใช้งานหมู่บ้านแทนการลบ เพื่อเก็บข้อมูลและสิทธิ์เดิม",
    };
  if (
    !Array.isArray(b.types) ||
    b.types.length !== 7 ||
    b.types.some(
      (t, i) =>
        !t ||
        t.id !== String(i) ||
        !Array.isArray(t.items) ||
        t.items.length > 100 ||
        t.items.some((x) => typeof x !== "string" || x.length > 300),
    )
  )
    return { error: "ประเภทความช่วยเหลือไม่ถูกต้อง" };
  return {
    value: {
      name: b.name.trim(),
      logo: b.logo,
      revision: b.revision + 1,
      villages: b.villages.map((v) => ({
        id: v.id,
        name: v.name.trim(),
        active: v.active,
      })),
      types: b.types.map((t, i) => ({
        id: t.id,
        name: categories[i],
        items: [...new Set(t.items.map((x) => x.trim()).filter(Boolean))],
      })),
    },
  };
}
