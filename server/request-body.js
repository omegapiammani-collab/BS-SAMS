export class RequestBodyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export async function readJsonObject(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("กรุณาส่งข้อมูล JSON แบบออบเจ็กต์");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1000000) {
        await reader.cancel();
        throw new RequestBodyError("ข้อมูลมีขนาดใหญ่เกินไป", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestBodyError("รูปแบบ JSON ไม่ถูกต้อง");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new RequestBodyError("กรุณาส่งข้อมูล JSON แบบออบเจ็กต์");
  return body;
}
