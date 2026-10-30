export const passwordHelp =
  "ใช้รหัสผ่าน 8–128 ตัวอักษร มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ";
export const passwordPattern =
  "(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{8,128}";
export const validPassword = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 128 &&
  !/[\r\n]/.test(value) &&
  new RegExp(`^${passwordPattern}$`, "u").test(value);
