import regularUrl from "./assets/fonts/Sarabun-Regular.ttf?url";
import boldUrl from "./assets/fonts/Sarabun-Bold.ttf?url";
import { categories } from "./domain.js";
import { formatThaiDate } from "./thai-date.js";

let fontsPromise;
function chartFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      [
        [regularUrl, "400"],
        [boldUrl, "600"],
      ].map(async ([url, weight]) => {
        const font = await new FontFace("SarabunChart", `url(${url})`, {
          weight,
        }).load();
        document.fonts.add(font);
      }),
    ).catch((error) => {
      fontsPromise = undefined;
      throw error;
    });
  }
  return fontsPromise;
}

export async function villageChartJpg(summary, config, range, category = "") {
  await chartFonts();
  const counts =
    category === ""
      ? summary.villages
      : summary.villagesByCategory[Number(category)];
  const rows = config.villages.map((v) => ({
    label: `ม.${v.id} บ้าน${v.name}`,
    count: counts[v.id] || 0,
  }));
  const width = 1200,
    padding = 40,
    rowHeight = 44,
    top = 190;
  const height = top + rows.length * rowHeight + 64;
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการสร้างภาพ JPG");
  ctx.scale(2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.font = "600 28px SarabunChart";
  ctx.fillText("จำนวนผู้ประสบปัญหารายหมู่บ้าน", padding, 56);
  ctx.font = "400 18px SarabunChart";
  ctx.fillText(
    `ช่วงวันที่ ${range.map(formatThaiDate).join(" – ")}`,
    padding,
    94,
  );
  ctx.fillText(
    `ประเภทความช่วยเหลือ: ${category === "" ? "ทั้งหมด" : categories[Number(category)]}`,
    padding,
    126,
  );
  ctx.fillText(
    "ขอบเขตข้อมูล: เฉพาะหมู่บ้านที่มีสิทธิ์ดูและส่งออก · หน่วย: คน",
    padding,
    158,
  );
  const labelWidth = Math.max(
    0,
    ...rows.map((row) => ctx.measureText(row.label).width),
  );
  const barX = padding + labelWidth + 20;
  const barWidth = width - barX - padding - 60;
  const max = Math.max(1, ...rows.map((row) => row.count));
  rows.forEach((row, index) => {
    const y = top + index * rowHeight;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.fillText(row.label, padding, y + 18);
    ctx.fillStyle = "#f4f6f5";
    ctx.fillRect(barX, y + 7, barWidth, 12);
    ctx.fillStyle = "#29245c";
    ctx.fillRect(barX, y + 7, (row.count / max) * barWidth, 12);
    ctx.fillStyle = "#000000";
    ctx.textAlign = "right";
    ctx.fillText(row.count.toLocaleString("th-TH"), width - padding, y + 18);
  });
  ctx.textAlign = "left";
  ctx.font = "600 18px SarabunChart";
  ctx.fillText(
    `รวมจำนวนคน ${rows.reduce((total, row) => total + row.count, 0).toLocaleString("th-TH")} คน`,
    padding,
    height - 30,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("สร้างภาพ JPG ไม่สำเร็จ กรุณาลองอีกครั้ง")),
      "image/jpeg",
      0.95,
    ),
  );
}
