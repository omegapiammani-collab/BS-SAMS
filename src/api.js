export async function api(path, method = "GET", body, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (r.status === 401 && path !== "/login")
    window.dispatchEvent(new Event("session-expired"));
  if (!r.ok) {
    const error = new Error(data.error || "เกิดข้อผิดพลาด");
    error.status = r.status;
    error.data = data;
    throw error;
  }
  return data;
}
