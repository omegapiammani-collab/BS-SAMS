export function formatThaiDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}
export function parseThaiDate(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, buddhistYear] = match;
  const year = Number(buddhistYear) - 543;
  if (year < 1 || year > 9999) return null;
  const iso = `${String(year).padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
