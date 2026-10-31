export async function hashPassword(password, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return `${salt}:${Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const check = await hashPassword(password, stored.split(":")[0]);
  let diff = check.length ^ stored.length;
  for (let i = 0; i < check.length; i++)
    diff |= check.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}
export function safeUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    permissions: JSON.parse(u.permissions),
    villages: JSON.parse(u.villages),
    mustChange: !!u.must_change,
    active: !!u.active,
  };
}
export function allowed(u, permission, village) {
  return (
    u.role === "admin" ||
    (u.permissions.includes(permission) && u.villages.includes(Number(village)))
  );
}
