const MAX_AMOUNT = 999999999.99;
export function toSatang(value) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT)
    return null;
  return Math.round(number * 100);
}
export function validMoney(value) {
  const cents = toSatang(value);
  if (cents === null) return false;
  const n = Number(value || 0) * 100;
  return Math.abs(n - cents) <= Number.EPSILON * Math.max(1, Math.abs(n)) * 2;
}
export function sumMoney(payments) {
  if (payments.some((p) => !validMoney(p.amount))) return null;
  return payments.reduce((sum, p) => sum + toSatang(p.amount), 0) / 100;
}
export const formatMoney = (value) =>
  Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const thailandDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
