export const normalizeName = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\s\p{P}]/gu, "");
function closeName(a, b) {
  if (a === b) return !!a;
  const x = [...a],
    y = [...b];
  if (Math.min(x.length, y.length) < 3 || Math.abs(x.length - y.length) > 1)
    return false;
  const previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    previous.splice(0, previous.length, ...next);
  }
  return previous[y.length] <= 1;
}
export function duplicateReasons(person, candidate) {
  const reasons = [];
  const first = normalizeName(person.first),
    last = normalizeName(person.last);
  const otherFirst = normalizeName(candidate.first),
    otherLast = normalizeName(candidate.last);
  if (person.nationalId && person.nationalId === candidate.nationalId)
    reasons.push("เลขบัตรประชาชนตรงกัน");
  if (first && last && first === otherFirst && last === otherLast)
    reasons.push("ชื่อและนามสกุลตรงกัน");
  else if (
    person.birth &&
    person.birth === candidate.birth &&
    ((first === otherFirst && closeName(last, otherLast)) ||
      (last === otherLast && closeName(first, otherFirst)))
  )
    reasons.push("ชื่อใกล้เคียงและวันเกิดตรงกัน");
  if (
    person.phone &&
    person.phone === candidate.phone &&
    (closeName(first, otherFirst) || closeName(last, otherLast))
  )
    reasons.push("เบอร์โทรตรงกันและชื่อใกล้เคียง");
  return reasons;
}
