import regularUrl from "./assets/fonts/Sarabun-Regular.ttf?url";
import boldUrl from "./assets/fonts/Sarabun-Bold.ttf?url";
import { pdfDocument } from "./pdf-document.js";
let fontsPromise;
async function loadFont(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("โหลดฟอนต์ PDF ไม่สำเร็จ กรุณาลองอีกครั้ง");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export async function pdfBlob(rows, title, options) {
  if (!fontsPromise) {
    fontsPromise = Promise.all([loadFont(regularUrl), loadFont(boldUrl)]).catch(
      (error) => {
        fontsPromise = undefined;
        throw error;
      },
    );
  }
  const [{ default: pdfMake }, [regular, bold]] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    fontsPromise,
  ]);
  return new Promise((resolve, reject) => {
    try {
      pdfMake
        .createPdf(
          pdfDocument(rows, options?.title || title, options),
          undefined,
          {
            Sarabun: {
              normal: "Sarabun-Regular.ttf",
              bold: "Sarabun-Bold.ttf",
              italics: "Sarabun-Regular.ttf",
              bolditalics: "Sarabun-Bold.ttf",
            },
          },
          { "Sarabun-Regular.ttf": regular, "Sarabun-Bold.ttf": bold },
        )
        .getBlob(resolve);
    } catch (error) {
      reject(error);
    }
  });
}
