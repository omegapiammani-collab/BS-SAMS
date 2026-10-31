import { allowed } from "./auth.js";
import { personFromRow } from "./people.js";
export const DRAFT_TTL = 7 * 86400000;
export class DraftError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const uuid = /^[a-f0-9-]{36}$/i;
export function validateDraftData(p) {
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    !Number.isInteger(p.village)
  )
    return false;
  for (const key of [
    "first",
    "last",
    "title",
    "nationalId",
    "birth",
    "marital",
    "phone",
    "houseCode",
    "house",
  ])
    if (
      p[key] !== undefined &&
      (typeof p[key] !== "string" || p[key].length > 1000)
    )
      return false;
  if (
    !Array.isArray(p.disabilities) ||
    p.disabilities.length > 7 ||
    p.disabilities.some((x) => typeof x !== "string")
  )
    return false;
  if (
    p.__dateDrafts &&
    (typeof p.__dateDrafts !== "object" ||
      Array.isArray(p.__dateDrafts) ||
      Object.entries(p.__dateDrafts).some(
        ([key, value]) =>
          key.length > 300 || typeof value !== "string" || value.length > 32,
      ))
  )
    return false;
  if (!Array.isArray(p.requests) || p.requests.length > 200) return false;
  if (new Set(p.requests.map((r) => r?.id)).size !== p.requests.length)
    return false;
  const optionalString = (object, key) =>
    object[key] === undefined || typeof object[key] === "string";
  return p.requests.every(
    (r) =>
      r &&
      typeof r.id === "string" &&
      !!r.id &&
      r.id.length <= 100 &&
      /^[0-6]$/.test(r.category) &&
      typeof r.type === "string" &&
      [
        "pending",
        "progress",
        "done",
        "rejected",
        "cancelled",
        "referred",
      ].includes(r.status) &&
      ["date", "note", "reason"].every((key) => optionalString(r, key)) &&
      Array.isArray(r.payments) &&
      r.payments.length <= 200 &&
      new Set(r.payments.map((x) => x?.id)).size === r.payments.length &&
      r.payments.every(
        (x) =>
          x &&
          typeof x.id === "string" &&
          !!x.id &&
          x.id.length <= 100 &&
          ["date", "provider", "unit", "detail"].every((key) =>
            optionalString(x, key),
          ) &&
          ["amount", "quantity"].every(
            (key) =>
              x[key] === undefined ||
              x[key] === null ||
              typeof x[key] === "string" ||
              (typeof x[key] === "number" && Number.isFinite(x[key])),
          ),
      ),
  );
}
async function access(db, user, data, personId) {
  if (
    !allowed(user, "view", data.village) ||
    !allowed(user, personId ? "edit" : "create", data.village)
  )
    return null;
  if (!personId) return { person: null };
  const row = await db
    .prepare("SELECT * FROM people WHERE id=? AND deleted_at IS NULL")
    .bind(personId)
    .first();
  if (
    !row ||
    !allowed(user, "view", row.village) ||
    !allowed(user, "edit", row.village)
  )
    return null;
  return {
    person: personFromRow(row),
  };
}
export async function listDrafts(db, user) {
  const now = Date.now();
  await db
    .prepare("DELETE FROM person_drafts WHERE expires_at<=?")
    .bind(now)
    .run();
  const { results } = await db
    .prepare(
      "SELECT * FROM person_drafts WHERE user_id=? ORDER BY updated_at DESC LIMIT 20",
    )
    .bind(user.id)
    .all();
  const items = [];
  for (const row of results) {
    const data = JSON.parse(row.data);
    if (await access(db, user, data, row.person_id))
      items.push({
        id: row.id,
        version: row.version,
        personId: row.person_id,
        first: data.first || "ยังไม่ระบุชื่อ",
        last: data.last || "",
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
      });
  }
  return { items };
}
export async function readDraft(db, user, id) {
  const row = await db
    .prepare(
      "SELECT * FROM person_drafts WHERE user_id=? AND id=? AND expires_at>?",
    )
    .bind(user.id, id, Date.now())
    .first();
  if (!row) throw new DraftError("ไม่พบร่างหรือร่างหมดอายุแล้ว", 410);
  const data = JSON.parse(row.data);
  const scope = await access(db, user, data, row.person_id);
  if (!scope)
    throw new DraftError(
      "ไม่มีสิทธิ์กู้คืนร่างนี้ หรือทะเบียนอยู่ในถังขยะ",
      403,
    );
  return {
    id: row.id,
    version: row.version,
    data,
    person: scope.person,
    conflict: !!scope.person && scope.person.version !== row.base_version,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
export async function saveDraft(db, user, id, body) {
  if (body.ownerId !== undefined && body.ownerId !== user.id)
    throw new DraftError("บัญชีผู้ใช้เปลี่ยนแล้ว กรุณาเปิดแบบฟอร์มใหม่", 403);
  if (
    !uuid.test(id) ||
    !Number.isInteger(body.version) ||
    body.version < 0 ||
    !validateDraftData(body.data)
  )
    throw new DraftError("ข้อมูลร่างไม่ถูกต้อง");
  const p = body.data,
    personId = p.id || null;
  if (
    personId &&
    (typeof personId !== "string" ||
      !Number.isInteger(p.version) ||
      p.version < 1)
  )
    throw new DraftError("เวอร์ชันทะเบียนไม่ถูกต้อง");
  const scope = await access(db, user, p, personId);
  if (!scope) throw new DraftError("ไม่มีสิทธิ์เก็บร่างในหมู่บ้านนี้", 403);
  if (scope.person && p.version > scope.person.version)
    throw new DraftError("เวอร์ชันทะเบียนไม่ถูกต้อง");
  const now = Date.now(),
    expires = now + DRAFT_TTL;
  await db
    .prepare("DELETE FROM person_drafts WHERE expires_at<=?")
    .bind(now)
    .run();
  let result;
  if (body.version === 0) {
    result = await db
      .prepare(
        "INSERT OR IGNORE INTO person_drafts(user_id,id,person_id,base_version,data,updated_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM person_drafts WHERE user_id=?)<20",
      )
      .bind(
        user.id,
        id,
        personId,
        personId ? p.version : null,
        JSON.stringify(p),
        now,
        expires,
        user.id,
      )
      .run();
  } else {
    result = await db
      .prepare(
        "UPDATE person_drafts SET data=?,version=version+1,updated_at=?,expires_at=? WHERE user_id=? AND id=? AND version=? AND person_id IS ? AND base_version IS ?",
      )
      .bind(
        JSON.stringify(p),
        now,
        expires,
        user.id,
        id,
        body.version,
        personId,
        personId ? p.version : null,
      )
      .run();
  }
  if (!result.meta.changes) {
    const existing = await db
      .prepare("SELECT * FROM person_drafts WHERE user_id=? AND id=?")
      .bind(user.id, id)
      .first();
    // Retrying a committed write after its response was lost is not a conflict.
    if (
      existing &&
      existing.version === body.version + 1 &&
      existing.person_id === personId &&
      existing.base_version === (personId ? p.version : null) &&
      existing.data === JSON.stringify(p)
    )
      return {
        id,
        version: existing.version,
        updatedAt: existing.updated_at,
        expiresAt: existing.expires_at,
      };
    if (body.version > 0 && !existing)
      throw new DraftError("ร่างหมดอายุแล้ว", 410);
    throw new DraftError(
      body.version === 0
        ? "เก็บร่างได้สูงสุด 20 รายการ กรุณาลบร่างที่ไม่ต้องการ"
        : "ร่างถูกแก้จากหน้าต่างอื่น กรุณาเปิดร่างล่าสุดก่อนแก้ต่อ",
      409,
    );
  }
  return { id, version: body.version + 1, updatedAt: now, expiresAt: expires };
}
export async function deleteDraft(db, user, id, version) {
  if (!Number.isInteger(version) || version < 1)
    throw new DraftError("เวอร์ชันร่างไม่ถูกต้อง");
  const result = await db
    .prepare("DELETE FROM person_drafts WHERE user_id=? AND id=? AND version=?")
    .bind(user.id, id, version)
    .run();
  if (!result.meta.changes) {
    const existing = await db
      .prepare("SELECT id FROM person_drafts WHERE user_id=? AND id=?")
      .bind(user.id, id)
      .first();
    if (existing)
      throw new DraftError("ร่างถูกแก้จากหน้าต่างอื่น กรุณาโหลดใหม่", 409);
  }
  return { ok: true };
}
export function draftCleanup(db, user, p, onlyIfChanged = false) {
  const draft = p.draftToDelete;
  delete p.draftToDelete;
  if (!draft) return [];
  if (
    !uuid.test(draft.id) ||
    !Number.isInteger(draft.version) ||
    draft.version < 1
  )
    throw new DraftError("ข้อมูลอ้างอิงร่างไม่ถูกต้อง");
  return [
    db
      .prepare(
        "DELETE FROM person_drafts WHERE user_id=? AND id=? AND version=?" +
          (onlyIfChanged ? " AND changes()>0" : ""),
      )
      .bind(user.id, draft.id, draft.version),
  ];
}
