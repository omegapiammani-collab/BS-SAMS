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
    dontBreakRows = false,
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
      color: "#000000",
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
        // Very long histories must still span pages. Split them into bounded
        // continuation rows, repeating identity so each page remains readable.
        const printableRows = group.flatMap((row, index) => {
          if (!dontBreakRows || index === 0 || !pairedColumns.length)
            return [row];
          const lines = pairedColumns.map((col) =>
            String(row[col] ?? "").split("\n"),
          );
          const chunks = [];
          let start = 0;
          let height = 0;
          const length = Math.max(...lines.map((values) => values.length));
          for (let pair = 0; pair < length; pair++) {
            const pairHeight = Math.max(
              ...pairedColumns.map((col, i) => {
                const width = (availableWidth * weights[col]) / totalWeight;
                const chars = Math.max(1, Math.floor((width - 4) / 9));
                return (
                  Math.max(
                    1,
                    Math.ceil((lines[i][pair]?.length || 0) / chars),
                  ) *
                    14 +
                  4
                );
              }),
            );
            if (pair > start && height + pairHeight > 480) {
              chunks.push([start, pair]);
              start = pair;
              height = 0;
            }
            height += pairHeight;
          }
          chunks.push([start, length]);
          return chunks.map(([from, to]) => {
            const continuation = [...row];
            pairedColumns.forEach((col, i) => {
              continuation[col] = lines[i].slice(from, to).join("\n");
            });
            return continuation;
          });
        });
        return {
          margin: [0, 0, 0, index === groups.length - 1 ? 0 : 12],
          layout: "lightHorizontalLines",
          table: {
            headerRows: 1,
            dontBreakRows,
            widths: weights.map(
              (weight) => (availableWidth * weight) / totalWeight,
            ),
            body: printableRows.map((row, index) => {
              const cell = (value, col) => ({
                text: pdfText(value, {
                  wrapChildAssistance,
                  lineBreakBefore,
                  thaiWordWrap: index > 0 && thaiWordWrapColumns.includes(col),
                }),
                bold: index === 0,
                fillColor: index === 0 ? "#edf4fc" : null,
                margin: [2, 4, 2, 4],
              });
              const cells = Array.from({ length: count }, (_, col) =>
                cell(row[col], col),
              );
              if (index === 0 || !pairedColumns.length) return cells;
              const lines = pairedColumns.map((col) =>
                String(row[col] ?? "").split("\n"),
              );
              const pairCount = Math.max(
                ...lines.map((values) => values.length),
              );
              if (pairCount < 2) return cells;
              // One outer row per person keeps identity and assistance together.
              // A nested table aligns wrapped pairs without row spans across pages.
              const start = pairedColumns[0];
              cells[start] = {
                colSpan: pairedColumns.length,
                margin: [2, 4, 2, 4],
                layout: {
                  hLineWidth: () => 0,
                  vLineWidth: () => 0,
                  paddingLeft: () => 0,
                  paddingRight: () => 0,
                  paddingTop: () => 0,
                  paddingBottom: () => 0,
                },
                table: {
                  widths: pairedColumns.map(
                    (col, i) =>
                      (availableWidth * weights[col]) / totalWeight +
                      (i === pairedColumns.length - 1 ? -4 : 16),
                  ),
                  body: Array.from({ length: pairCount }, (_, pair) =>
                    pairedColumns.map((col, i) => ({
                      ...cell(lines[i][pair], col),
                      margin: [0, 0, 0, pair < pairCount - 1 ? 4 : 0],
                    })),
                  ),
                },
              };
              for (const col of pairedColumns.slice(1)) cells[col] = {};
              return cells;
            }),
          },
        };
      }),
  };
}
