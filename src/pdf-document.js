export function pdfDocument(
  rows,
  title,
  { orientation = "landscape", columnWeights } = {},
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
        const availableWidth = pageWidth - 56 - count * 10;
        return {
          margin: [0, 0, 0, index === groups.length - 1 ? 0 : 12],
          layout: "lightHorizontalLines",
          table: {
            headerRows: 1,
            widths: weights.map(
              (weight) => (availableWidth * weight) / totalWeight,
            ),
            body: group.map((row, index) =>
              Array.from({ length: count }, (_, col) => ({
                text: String(row[col] ?? ""),
                bold: index === 0,
                fillColor: index === 0 ? "#edf4fc" : null,
                margin: [2, 4, 2, 4],
              })),
            ),
          },
        };
      }),
  };
}
