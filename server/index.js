import {
  defaultConfig,
  summarize,
  validatePerson,
  permissions,
} from "../src/domain.js";
import { hashPassword, verifyPassword, safeUser, allowed } from "./auth.js";
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const fail = (message, status = 400) => json({ error: message }, status);
const cookie = (r) =>
  r.headers.get("Cookie")?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
const audit = (db, u, action, target) =>
  db
    .prepare("INSERT INTO audit(actor,action,target) VALUES(?,?,?)")
    .bind(u.id, action, target);
async function config(db) {
  const row = await db
    .prepare("SELECT data FROM config WHERE id='system'")
    .first();
  return row ? JSON.parse(row.data) : structuredClone(defaultConfig);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url),
      path = url.pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      const db = env.DB,
        method = request.method;
      if (!["GET", "HEAD"].includes(method)) {
        const origin = request.headers.get("Origin");
        if (origin && origin !== url.origin)
          return fail("Origin ไม่ถูกต้อง", 403);
        if (
          !request.headers.get("Content-Type")?.startsWith("application/json")
        )
          return fail("ต้องใช้ JSON", 415);
        if (Number(request.headers.get("Content-Length")) > 1000000)
          return fail("ข้อมูลมีขนาดใหญ่เกินไป", 413);
      }
      if (path === "/api/login" && method === "POST") {
        const b = await request.json();
        if (
          typeof b.username !== "string" ||
          typeof b.password !== "string" ||
          b.password.length > 256
        )
          return fail("ข้อมูลเข้าสู่ระบบไม่ถูกต้อง");
        const key = request.headers.get("CF-Connecting-IP") || "local",
          now = Date.now();
        await db
          .prepare(
            "INSERT INTO login_limits(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END",
          )
          .bind(key, now + 900000, now, now)
          .run();
        const limit = await db
          .prepare("SELECT attempts FROM login_limits WHERE key=?")
          .bind(key)
          .first();
        if (limit.attempts > 20) return fail("ลองใหม่ในอีก 15 นาที", 429);
        const row = await db
          .prepare("SELECT * FROM users WHERE username=? AND active=1")
          .bind(b.username)
          .first();
        const valid = await verifyPassword(
          b.password,
          row?.password || (await hashPassword("invalid-password")),
        );
        if (!row || !valid)
          return fail("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401);
        const token = crypto.randomUUID() + crypto.randomUUID();
        await db
          .prepare("INSERT INTO sessions VALUES(?,?,?)")
          .bind(token, row.id, now + 8 * 3600000)
          .run();
        return json(safeUser(row), 200, {
          "Set-Cookie": `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${url.protocol === "https:" ? "; Secure" : ""}`,
        });
      }
      const row = await db
        .prepare(
          "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1",
        )
        .bind(cookie(request) || "", Date.now())
        .first();
      if (!row) return fail("กรุณาเข้าสู่ระบบ", 401);
      const u = safeUser(row);
      if (path === "/api/me") return json(u);
      if (path === "/api/logout" && method === "POST") {
        await db
          .prepare("DELETE FROM sessions WHERE token=?")
          .bind(cookie(request))
          .run();
        return json({ ok: true }, 200, {
          "Set-Cookie":
            "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        });
      }
      if (path === "/api/password" && method === "POST") {
        const b = await request.json();
        if (!(await verifyPassword(b.current, row.password)))
          return fail("รหัสผ่านเดิมไม่ถูกต้อง");
        if (
          typeof b.password !== "string" ||
          b.password.length < 12 ||
          b.password.length > 128 ||
          b.password === b.current
        )
          return fail("ใช้รหัสผ่านใหม่ 12–128 ตัวอักษร");
        await db.batch([
          db
            .prepare("UPDATE users SET password=?,must_change=0 WHERE id=?")
            .bind(await hashPassword(b.password), u.id),
          db.prepare("DELETE FROM sessions WHERE user_id=?").bind(u.id),
          audit(db, u, "change-password", u.id),
        ]);
        return json({ ok: true }, 200, {
          "Set-Cookie":
            "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        });
      }
      if (u.mustChange) return fail("กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน", 403);
      if (path === "/api/config") {
        if (method === "GET") return json(await config(db));
        if (method === "PUT" && u.role === "admin") {
          const b = await request.json();
          if (
            !b.name?.trim() ||
            !Array.isArray(b.villages) ||
            !b.villages.length ||
            !Array.isArray(b.types) ||
            b.types.length !== 7
          )
            return fail("การตั้งค่าไม่ถูกต้อง");
          if (
            new Set(b.villages.map((v) => v.id)).size !== b.villages.length ||
            b.villages.some((v) => !Number.isInteger(v.id) || !v.name?.trim())
          )
            return fail("ข้อมูลหมู่บ้านไม่ถูกต้อง");
          if (
            b.name.length > 200 ||
            b.types.some(
              (t, i) =>
                t.id !== String(i) ||
                !Array.isArray(t.items) ||
                t.items.length > 100 ||
                t.items.some((x) => typeof x !== "string" || x.length > 300),
            ) ||
            b.villages.some((v) => typeof v.active !== "boolean") ||
            typeof b.logo !== "string" ||
            b.logo.length > 280000
          )
            return fail("การตั้งค่าไม่ถูกต้อง");
          if (b.logo && !/^data:image\/(png|jpeg|webp);base64,/.test(b.logo))
            return fail("โลโก้ต้องเป็น PNG, JPEG หรือ WebP");
          await db.batch([
            db
              .prepare(
                "INSERT INTO config VALUES('system',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
              )
              .bind(JSON.stringify(b)),
            audit(db, u, "update-config", "system"),
          ]);
          return json(b);
        }
        return fail("ไม่มีสิทธิ์", 403);
      }
      const all = async () => {
        const result = await db.prepare("SELECT * FROM people").all();
        return result.results.map((p) => ({
          ...JSON.parse(p.data),
          id: p.id,
          version: p.version,
          deletedAt: p.deleted_at,
          deletedBy: p.deleted_by,
          deleteReason: p.delete_reason,
        }));
      };
      if (path === "/api/summary" && method === "GET") {
        const list = (await all()).filter((p) => !p.deletedAt);
        return json(
          summarize(
            list,
            url.searchParams.get("from"),
            url.searchParams.get("to"),
          ),
        );
      }
      if (path === "/api/people" && method === "GET") {
        const trash = url.searchParams.get("trash") === "1";
        if (trash && u.role !== "admin") return fail("ไม่มีสิทธิ์", 403);
        return json(
          (await all()).filter(
            (p) => !!p.deletedAt === trash && allowed(u, "view", p.village),
          ),
        );
      }
      if (path === "/api/export" && method === "POST") {
        const b = await request.json();
        const list = (await all()).filter(
          (p) =>
            !p.deletedAt &&
            allowed(u, "view", p.village) &&
            allowed(u, "export", p.village),
        );
        await audit(db, u, "export", "people").run();
        return json(list.filter((p) => !b.ids || b.ids.includes(p.id)));
      }
      if (path === "/api/people" && method === "POST") {
        const p = await request.json(),
          cfg = await config(db);
        p.village = Number(p.village);
        const err = validatePerson(p, cfg);
        if (err) return fail(err);
        if (!allowed(u, "create", p.village) || !allowed(u, "view", p.village))
          return fail("ไม่มีสิทธิ์ในหมู่บ้านนี้", 403);
        const id = crypto.randomUUID();
        p.id = id;
        p.createdAt = new Date().toISOString();
        await db.batch([
          db
            .prepare(
              "INSERT INTO people(id,national_id,village,data) VALUES(?,?,?,?)",
            )
            .bind(
              id,
              p.nationalId || null,
              Number(p.village),
              JSON.stringify(p),
            ),
          audit(db, u, "create-person", id),
        ]);
        return json({ ...p, version: 1 }, 201);
      }
      const match = path.match(/^\/api\/people\/([^/]+)(\/restore)?$/);
      if (match) {
        const id = match[1],
          stored = await db
            .prepare("SELECT * FROM people WHERE id=?")
            .bind(id)
            .first();
        if (!stored) return fail("ไม่พบข้อมูล", 404);
        const old = JSON.parse(stored.data);
        if (method === "POST" && match[2] && u.role === "admin") {
          await db.batch([
            db
              .prepare(
                "UPDATE people SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL,version=version+1 WHERE id=?",
              )
              .bind(id),
            audit(db, u, "restore", id),
          ]);
          return json({ ok: true });
        }
        if (stored.deleted_at) return fail("ข้อมูลอยู่ในถังขยะ", 404);
        if (method === "PUT") {
          const p = await request.json();
          p.village = Number(p.village);
          if (
            !allowed(u, "view", stored.village) ||
            !allowed(u, "edit", stored.village) ||
            !allowed(u, "edit", p.village) ||
            !allowed(u, "view", p.village)
          )
            return fail("ไม่มีสิทธิ์", 403);
          const err = validatePerson(p, await config(db));
          if (err) return fail(err);
          const result = await db.batch([
            db
              .prepare(
                "UPDATE people SET national_id=?,village=?,data=?,version=version+1 WHERE id=? AND version=?",
              )
              .bind(
                p.nationalId || null,
                Number(p.village),
                JSON.stringify({ ...p, id, createdAt: old.createdAt }),
                id,
                p.version,
              ),
            audit(db, u, "update-person", id),
          ]);
          if (!result[0].meta.changes)
            return fail("มีผู้แก้ไขข้อมูลแล้ว กรุณาโหลดใหม่", 409);
          return json({ ...p, version: p.version + 1 });
        }
        if (method === "DELETE") {
          if (
            !allowed(u, "delete", stored.village) ||
            !allowed(u, "view", stored.village)
          )
            return fail("ไม่มีสิทธิ์", 403);
          const b = await request.json();
          if (!b.reason?.trim()) return fail("กรุณาระบุเหตุผล");
          await db.batch([
            db
              .prepare(
                "UPDATE people SET deleted_at=?,deleted_by=?,delete_reason=?,version=version+1 WHERE id=?",
              )
              .bind(new Date().toISOString(), u.username, b.reason, id),
            audit(db, u, "delete-person", id),
          ]);
          return json({ ok: true });
        }
      }
      if (path === "/api/users" && u.role === "admin") {
        if (method === "GET") {
          const users = await db
            .prepare("SELECT * FROM users ORDER BY username")
            .all();
          return json(users.results.map(safeUser));
        }
        if (method === "POST" || method === "PUT") {
          const b = await request.json();
          if (
            !/^[a-zA-Z0-9._-]{3,50}$/.test(b.username) ||
            !b.name?.trim() ||
            !["admin", "staff"].includes(b.role) ||
            !Array.isArray(b.permissions) ||
            b.permissions.some((p) => !permissions.includes(p)) ||
            !Array.isArray(b.villages) ||
            b.villages.some((v) => !Number.isInteger(v))
          )
            return fail("ข้อมูลผู้ใช้งานไม่ถูกต้อง");
          if (b.password && (b.password.length < 12 || b.password.length > 128))
            return fail("รหัสผ่านต้องมี 12–128 ตัวอักษร");
          if (b.id === u.id && (b.role !== "admin" || !b.active))
            return fail("ไม่สามารถลดสิทธิ์หรือปิดบัญชีตัวเอง");
          const id = method === "POST" ? crypto.randomUUID() : b.id;
          if (method === "POST") {
            if (!b.password) return fail("กรุณากำหนดรหัสผ่านชั่วคราว");
            await db.batch([
              db
                .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,1,1)")
                .bind(
                  id,
                  b.username,
                  b.name,
                  await hashPassword(b.password),
                  b.role,
                  JSON.stringify(b.permissions),
                  JSON.stringify(b.villages),
                ),
              audit(db, u, "create-user", id),
            ]);
          } else {
            await db.batch([
              db
                .prepare(
                  "UPDATE users SET username=?,name=?,role=?,permissions=?,villages=?,active=? WHERE id=?",
                )
                .bind(
                  b.username,
                  b.name,
                  b.role,
                  JSON.stringify(b.permissions),
                  JSON.stringify(b.villages),
                  b.active ? 1 : 0,
                  id,
                ),
              db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id),
              audit(db, u, "update-user", id),
            ]);
            if (b.password)
              await db
                .prepare("UPDATE users SET password=?,must_change=1 WHERE id=?")
                .bind(await hashPassword(b.password), id)
                .run();
          }
          return json({ ok: true });
        }
      }
      if (path === "/api/audit" && u.role === "admin" && method === "GET")
        return json(
          (
            await db
              .prepare(
                "SELECT a.*,u.username FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 200",
              )
              .all()
          ).results,
        );
      return fail("ไม่พบเส้นทางหรือไม่มีสิทธิ์", 404);
    } catch (e) {
      if (String(e).includes("UNIQUE constraint"))
        return fail("เลขบัตรประชาชนหรือชื่อผู้ใช้ซ้ำ", 409);
      console.error("API failure", e.name);
      return fail("ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่", 500);
    }
  },
};
