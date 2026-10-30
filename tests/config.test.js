import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { cleanConfig } from "../server/config.js";
import { defaultConfig } from "../src/domain.js";
const original = () => structuredClone(defaultConfig);
test("configuration trims type lists without changing fixed category identities", () => {
  const c = original();
  c.name = " ระบบใหม่ ";
  c.types[0].name = "ไม่ใช่ชื่อหมวด";
  c.types[0].items = [" รายการ A ", "", "รายการ A", "รายการ B"];
  const r = cleanConfig(c, original());
  assert.equal(r.value.name, "ระบบใหม่");
  assert.equal(r.value.revision, 1);
  assert.deepEqual(r.value.types[0].items, ["รายการ A", "รายการ B"]);
  assert.equal(r.value.types[0].name, defaultConfig.types[0].name);
});
test("invalid and orphaning configuration changes are rejected", () => {
  for (const c of [
    null,
    { ...original(), name: 123 },
    { ...original(), revision: -1 },
    { ...original(), villages: [null] },
    { ...original(), villages: original().villages.slice(1) },
    { ...original(), types: [null] },
    { ...original(), logo: "data:image/svg+xml;base64,abc" },
  ])
    assert.ok(cleanConfig(c, original()).error);
  const c = original();
  c.villages[0].active = false;
  assert.ok(cleanConfig(c, original()).value);
});
test("conditional upsert rejects a stale settings write including first save", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE config(id TEXT PRIMARY KEY,data TEXT)");
  const sql =
    "INSERT INTO config(id,data) VALUES('system',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE COALESCE(json_extract(config.data,'$.revision'),0)=?";
  const save = db.prepare(sql);
  assert.equal(
    save.run(JSON.stringify({ revision: 1, name: "first" }), 0).changes,
    1,
  );
  assert.equal(
    save.run(JSON.stringify({ revision: 1, name: "stale" }), 0).changes,
    0,
  );
  assert.equal(
    save.run(JSON.stringify({ revision: 2, name: "next" }), 1).changes,
    1,
  );
  assert.equal(
    JSON.parse(db.prepare("SELECT data FROM config").get().data).name,
    "next",
  );
  db.close();
});
