import { isDate, validNationalId } from "../src/domain.js";
import {
  QueryError,
  parsePeopleQuery,
  peopleSelection,
  personListItem,
} from "./people.js";
export function duplicateSelection(user, b) {
  if (
    !b ||
    typeof b !== "object" ||
    Array.isArray(b) ||
    ["first", "last", "birth", "phone", "nationalId", "id"].some(
      (key) => b[key] !== undefined && typeof b[key] !== "string",
    ) ||
    String(b.first || "").length > 100 ||
    String(b.last || "").length > 100 ||
    String(b.id || "").length > 100
  )
    throw new QueryError("ข้อมูลตรวจสอบทะเบียนซ้ำไม่ถูกต้อง");
  if (
    (b.birth && !isDate(b.birth)) ||
    (b.phone && !/^0\d{8,9}$/.test(b.phone)) ||
    (b.nationalId && !validNationalId(b.nationalId))
  )
    throw new QueryError("วันเกิด เบอร์โทร หรือเลขบัตรไม่ถูกต้อง");
  const signals = [],
    identity = [],
    identityArgs = [];
  if (b.birth) {
    identity.push("json_extract(data,'$.birth')=?");
    identityArgs.push(b.birth);
  }
  if (b.phone) {
    identity.push("json_extract(data,'$.phone')=?");
    identityArgs.push(b.phone);
  }
  const matchArgs = [];
  if (b.nationalId) {
    signals.push("national_id=?");
    matchArgs.push(b.nationalId);
  }
  if (b.first?.trim() && b.last?.trim() && identity.length) {
    signals.push(
      `(lower(trim(json_extract(data,'$.first')))=lower(?) AND lower(trim(json_extract(data,'$.last')))=lower(?) AND (${identity.join(" OR ")}))`,
    );
    matchArgs.push(b.first.trim(), b.last.trim(), ...identityArgs);
  }
  if (!signals.length) return null;
  const scope = peopleSelection(user, parsePeopleQuery(new URLSearchParams()));
  return {
    where: `${scope.where} AND (${signals.join(" OR ")})${b.id ? " AND id<>?" : ""}`,
    args: [...scope.args, ...matchArgs, ...(b.id ? [b.id] : [])],
  };
}
export async function findDuplicates(db, user, body) {
  const selection = duplicateSelection(user, body);
  if (!selection) return { items: [], total: 0 };
  const [count, rows] = await db.batch([
    db
      .prepare(`SELECT COUNT(*) AS total FROM people WHERE ${selection.where}`)
      .bind(...selection.args),
    db
      .prepare(
        `SELECT * FROM people WHERE ${selection.where} ORDER BY CASE WHEN national_id=? THEN 0 ELSE 1 END,id LIMIT 5`,
      )
      .bind(...selection.args, body.nationalId || null),
  ]);
  return {
    items: rows.results.map((row) => {
      const p = JSON.parse(row.data);
      return {
        ...personListItem(row),
        matchReason:
          body.nationalId && row.national_id === body.nationalId
            ? "nationalId"
            : body.birth && p.birth === body.birth
              ? "birth"
              : "phone",
      };
    }),
    total: count.results[0].total,
  };
}
