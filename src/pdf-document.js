import { pdfText } from "./pdf-text.js";

export function pdfDocument(
  rows,
  title,
  {
    orientation = "landscape",
    columnWeights,
    wrapChildAssistance = false,
    thaiWordWrapColumns = [],
    pairedColumns = [],
    lineBreakBefore = [],
  } = {},
) {
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const groups = [];
  for (const row of rows.length ? rows : [["ไม่มีข้อมูล"]]) {
    if (!row.length) {
      if (groups.at(-1)?.length) groups.push([]);
    } else {
      if (!groups.length) groups.push([]);
      groups.at(-1).push(row);
    }
  }
  return {
    info: { title, creator: "BS-SAMS" },
    pageSize: columns > 6 ? "A3" : "A4",
    pageOrientation: orientation,
    pageMargins: [28, 42, 28, 36],
    defaultStyle: {
      font: "Sarabun",
      fontSize: columns > 6 ? 9 : orientation === "portrait" ? 10 : 11,
      color: "#20324b",
    },
    header: { text: title, bold: true, fontSize: 14, margin: [28, 14, 28, 0] },
    footer: (page, pages) => ({
      text: `หน้า ${page} / ${pages}`,
      alignment: "right",
      margin: [28, 8, 28, 0],
      fontSize: 9,
    }),
    content: groups
      .filter((group) => group.length)
      .map((group, index, groups) => {
        const count = Math.max(...group.map((row) => row.length));
        const pageWidth =
          orientation === "portrait"
            ? columns > 6
              ? 841.89
              : 595.28
            : columns > 6
              ? 1190.55
              : 841.89;
        const weights = columnWeights ?? Array(count).fill(1);
        const totalWeight = weights.reduce(
          (total, weight) => total + weight,
          0,
        );
        // pdfmake's lightHorizontalLines layout adds 8pt on each side of
        // internal column boundaries, with no padding at the outer edges.
        const availableWidth = pageWidth - 56 - (count - 1) * 16;
        return {
          margin: [0, 0, 0, index === groups.length - 1 ? 0 : 12],
          layout: "lightHorizontalLines",
          table: {
            headerRows: 1,
            widths: weights.map(
              (weight) => (availableWidth * weight) / totalWeight,
            ),
            body: group.flatMap((row, index) => {
              const pairs = new Map(
                index === 0
                  ? []
                  : pairedColumns.map((col) => [
                      col,
                      String(row[col] ?? "").split("\n"),
                    ]),
              );
              const pairCount = Math.max(
                1,
                ...Array.from(pairs.values(), (lines) => lines.length),
              );
              return Array.from({ length: pairCount }, (_, pairIndex) =>
                Array.from({ length: count }, (_, col) => {
                  if (pairIndex > 0 && !pairs.has(col)) return {};
                  return {
                    text: pdfText(
                      pairs.has(col) ? pairs.get(col)[pairIndex] : row[col],
                      {
                        wrapChildAssistance,
                        lineBreakBefore,
                        thaiWordWrap:
                          index > 0 && thaiWordWrapColumns.includes(col),
                      },
                    ),
                    ...(!pairs.has(col) && pairCount > 1
                      ? { rowSpan: pairCount }
                      : {}),
                    ...(pairs.has(col) && pairCount > 1
                      ? {
                          border: [
                            false,
                            pairIndex === 0,
                            false,
                            pairIndex === pairCount - 1,
                          ],
                        }
                      : {}),
                    bold: index === 0,
                    fillColor: index === 0 ? "#edf4fc" : null,
                    margin: [2, 4, 2, 4],
                  };
                }),
              );
            }),
          },
        };
      }),
  };
}
