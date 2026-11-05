const thaiWords = new Intl.Segmenter("th", { granularity: "word" });
const thaiScript = /\p{Script=Thai}/u;

// pdfmake does not segment Thai words. Keep each word in an unbreakable run;
// empty runs allow a new line between adjacent Thai words without adding glyphs.
export function pdfText(
  value,
  { wrapChildAssistance = false, thaiWordWrap = false } = {},
) {
  const text = wrapChildAssistance
    ? String(value ?? "").replaceAll(
        "เงินสงเคราะห์เด็กในครอบครัวยากจน",
        "เงินสงเคราะห์เด็กในครอบครัว\nยากจน",
      )
    : String(value ?? "");
  if (!thaiWordWrap || !thaiScript.test(text)) return text;
  const output = [];
  let previousWasThai = false;
  for (const { segment } of thaiWords.segment(text)) {
    const isThai = thaiScript.test(segment);
    if (previousWasThai && isThai) output.push({ text: "" });
    output.push({ text: segment, noWrap: isThai });
    previousWasThai = isThai;
  }
  return output;
}
