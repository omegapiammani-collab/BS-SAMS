import { auditActions } from "../src/audit-actions.js";
import { isDate } from "../src/domain.js";
import { QueryError } from "./people.js";
export function auditSelection(params) {
  const get = (key) => params.get(key) || "";
  const numeric = (key, fallback, max) => {
    const v = get(key);
    if (!v) return fallback;
    if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max)
      throw new QueryError("เลขหน้าหรือจำนวนรายการไม่ถูกต้อง");
    return Number(v);
  };
  const query = {
    from: get("from"),
    to: get("to"),
    action: get("action"),
    actor: get("actor").trim(),
    target: get("target").trim(),
    page: numeric("page", 1, 1000000),
    size: numeric("size", 25, 100),
  };
  if (
    (query.from && !isDate(query.from)) ||
    (query.to && !isDate(query.to)) ||
    (query.from && query.to && query.from > query.to)
  )
    throw new QueryError("ช่วงวันที่ไม่ถูกต้อง");
  if (
    (query.action && !Object.hasOwn(auditActions, query.action)) ||
    query.actor.length > 100 ||
    query.target.length > 200
  )
    throw new QueryError("เงื่อนไขประวัติไม่ถูกต้อง");
  const where = [],
    args = [];
  if (query.from) {
    where.push("a.created_at >= datetime(?,'-7 hours')");
    args.push(query.from);
  }
  if (query.to) {
    where.push("a.created_at < datetime(?,'+1 day','-7 hours')");
    args.push(query.to);
  }
  if (query.action) {
    where.push("a.action=?");
    args.push(query.action);
  }
  if (query.actor) {
    where.push(
      "(instr(lower(COALESCE(a.actor_username,u.username,a.actor)),lower(?))>0 OR a.actor=?)",
    );
    args.push(query.actor, query.actor);
  }
  if (query.target) {
    where.push("instr(a.target,?)>0");
    args.push(query.target);
  }
  return { ...query, where: where.length ? where.join(" AND ") : "1", args };
}
export async function listAudit(db, params) {
  const q = auditSelection(params),
    from = "FROM audit a LEFT JOIN users u ON u.id=a.actor";
  const [count, rows] = await db.batch([
    db
      .prepare(`SELECT COUNT(*) AS total ${from} WHERE ${q.where}`)
      .bind(...q.args),
    db
      .prepare(
        `SELECT a.*,u.username AS current_username ${from} WHERE ${q.where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...q.args, q.size, (q.page - 1) * q.size),
  ]);
  return {
    items: rows.results,
    total: count.results[0].total,
    page: q.page,
    size: q.size,
  };
}
