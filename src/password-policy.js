export const passwordHelp =
  "ใช้รหัสผ่าน 8–128 ตัวอักษร มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ";
export const passwordPattern =
  "(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[\\p{P}\\p{S}]).{8,128}";
export const validPassword = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 128 &&
  !/[\r\n]/.test(value) &&
  new RegExp(`^${passwordPattern}$`, "u").test(value);

export function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?";
  const limit = 256 - (256 % alphabet.length);
  const byte = new Uint8Array(1);
  let password;
  do {
    password = "";
    while (password.length < 8) {
      crypto.getRandomValues(byte);
      if (byte[0] < limit) password += alphabet[byte[0] % alphabet.length];
    }
  } while (!validPassword(password));
  return password;
}
