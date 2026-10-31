import { duplicateReasons } from "../src/duplicate-person.js";
import { peopleSelection, parsePeopleQuery } from "./people.js";
export async function findDuplicates(db, user, person) {
  const selection = peopleSelection(
    user,
    parsePeopleQuery(new URLSearchParams()),
  );
  const where = user.role === "admin" ? "1" : selection.where;
  const rows = await db
    .prepare(
      `SELECT id,village,version,deleted_at,json_extract(data,'$.first') AS first,json_extract(data,'$.last') AS last,json_extract(data,'$.birth') AS birth,json_extract(data,'$.phone') AS phone,national_id AS nationalId FROM people WHERE ${where}`,
    )
    .bind(...selection.args)
    .all();
  const candidates = rows.results
    .filter((row) => row.id !== person.id)
    .map((row) => ({ ...row, reasons: duplicateReasons(person, row) }))
    .filter((row) => row.reasons.length)
    .sort(
      (a, b) => b.reasons.length - a.reasons.length || a.id.localeCompare(b.id),
    )
    .slice(0, 10);
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      user: user.id,
      first: person.first,
      last: person.last,
      birth: person.birth,
      phone: person.phone,
      nationalId: person.nationalId,
      village: person.village,
      candidates: candidates.map((c) => [c.id, c.version, c.deleted_at]),
    }),
  );
  const token = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    token,
    candidates: candidates.map(({ nationalId, phone, version, ...row }) => row),
  };
}
