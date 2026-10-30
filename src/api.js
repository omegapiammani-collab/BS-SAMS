export async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (r.status === 401 && path !== "/login")
    window.dispatchEvent(new Event("session-expired"));
  if (!r.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}
