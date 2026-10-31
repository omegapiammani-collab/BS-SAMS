import { personLabels, closed } from "../src/domain.js";

export class QueryError extends Error {}
export function parsePeopleQuery(params) {
  const get = (key) => params.get(key) ?? "";
  const integer = (key, fallback, max) => {
    const text = get(key);
    if (!text) return fallback;
    if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > max)
      throw new QueryError("เลขหน้า จำนวนรายการ หรือหมู่บ้านไม่ถูกต้อง");
    return Number(text);
  };
  const query = {
    q: get("q").trim(),
    village: integer("village", null, 10000),
    status: get("status"),
    cat: get("cat"),
    page: integer("page", 1, 1000000),
    size: integer("size", 10, 100),
    sort: get("sort") || "name",
    direction: get("direction") || "asc",
    trash: get("trash") === "1",
  };
  if (
    query.q.length > 200 ||
    (query.status && !Object.hasOwn(personLabels, query.status)) ||
    (query.cat && !/^[0-6]$/.test(query.cat)) ||
    !["name", "village"].includes(query.sort) ||
    !["asc", "desc"].includes(query.direction)
  )
    throw new QueryError("เงื่อนไขการค้นหาไม่ถูกต้อง");
  return query;
}
// Keep the SQL classification equivalent to personStatus; parity is tested using SQLite.
export const statusSql = `CASE
 WHEN json_array_length(data,'$.requests')=0 THEN 'none'
 WHEN NOT EXISTS(SELECT 1 FROM json_each(data,'$.requests') r WHERE json_extract(r.value,'$.status')<>'done') THEN 'done'
 WHEN NOT EXISTS(SELECT 1 FROM json_each(data,'$.requests') r WHERE json_extract(r.value,'$.status') NOT IN (${closed.map((s) => `'${s}'`).join(",")})) THEN 'closed'
 WHEN EXISTS(SELECT 1 FROM json_each(data,'$.requests') r WHERE json_extract(r.value,'$.status')='done' OR json_array_length(r.value,'$.payments')>0) THEN 'partial'
 WHEN EXISTS(SELECT 1 FROM json_each(data,'$.requests') r WHERE json_extract(r.value,'$.status')='progress') THEN 'progress'
 ELSE 'pending' END`;
export function peopleSelection(user, query, exporting = false) {
  const where = [query.trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"],
    args = [];
  if (user.role !== "admin") {
    if (
      !user.permissions.includes("view") ||
      (exporting && !user.permissions.includes("export")) ||
      !user.villages.length
    )
      where.push("0");
    else {
      where.push(`village IN (${user.villages.map(() => "?").join(",")})`);
      args.push(...user.villages);
    }
  }
  if (query.village) {
    where.push("village=?");
    args.push(query.village);
  }
  if (query.q) {
    where.push(
      "instr(lower(COALESCE(json_extract(data,'$.first'),'')||' '||COALESCE(json_extract(data,'$.last'),'')||' '||COALESCE(national_id,'')||' '||id),lower(?))>0",
    );
    args.push(query.q);
  }
  if (query.status) {
    where.push(`(${statusSql})=?`);
    args.push(query.status);
  }
  if (query.cat) {
    where.push(
      "EXISTS(SELECT 1 FROM json_each(data,'$.requests') r WHERE CAST(json_extract(r.value,'$.category') AS TEXT)=?)",
    );
    args.push(query.cat);
  }
  const direction = query.direction === "desc" ? "DESC" : "ASC";
  const name = "json_extract(data,'$.first')||' '||json_extract(data,'$.last')";
  const order =
    query.sort === "village"
      ? `village ${direction}, ${name} ${direction}, id ASC`
      : `${name} ${direction}, id ASC`;
  return { where: where.join(" AND "), args, order };
}
export function personFromRow(p) {
  return {
    ...JSON.parse(p.data),
    id: p.id,
    version: p.version,
    deletedAt: p.deleted_at,
    deletedBy: p.deleted_by,
    deleteReason: p.delete_reason,
  };
}
export async function listPeople(db, user, query) {
  const selection = peopleSelection(user, query);
  const count = db
    .prepare(`SELECT COUNT(*) AS total FROM people WHERE ${selection.where}`)
    .bind(...selection.args);
  const rows = db
    .prepare(
      `SELECT * FROM people WHERE ${selection.where} ORDER BY ${selection.order} LIMIT ? OFFSET ?`,
    )
    .bind(...selection.args, query.size, (query.page - 1) * query.size);
  const [total, items] = await db.batch([count, rows]);
  return {
    items: items.results.map(personFromRow),
    total: total.results[0].total,
    page: query.page,
    size: query.size,
  };
}
