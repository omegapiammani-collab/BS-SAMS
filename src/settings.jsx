import { useUnsavedChanges } from "./use-unsaved-changes";
import { AuditHistory } from "./audit-history";
import React, { useEffect, useState, useRef } from "react";
import { Plus, Pencil, Save, KeyRound } from "lucide-react";
import { api } from "./api";
import { permissions, permissionLabels, categories } from "./domain";
import { Modal, Field, Select, ErrorBox, ConfirmDialog } from "./ui";
export function UserAdmin({ config, me }) {
  const [users, setUsers] = useState([]),
    [edit, setEdit] = useState(null),
    [reset, setReset] = useState(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const editSnapshot = useRef("");
  const [confirmClose, setConfirmClose] = useState(false);
  const editDirty = !!edit && JSON.stringify(edit) !== editSnapshot.current;
  useUnsavedChanges(editDirty);
  function openEditor(value) {
    editSnapshot.current = JSON.stringify(value);
    setEdit(value);
    setError("");
    setNotice("");
  }
  function closeEditor() {
    if (busy) return;
    if (editDirty) setConfirmClose(true);
    else setEdit(null);
  }
  async function load() {
    try {
      setUsers(await api("/users"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function change(k, v) {
    setEdit({ ...edit, [k]: v });
  }
  return (
    <>
      <ErrorBox error={error} />
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <section className="panel">
        <div className="panel-title">
          <h2>
            บัญชีผู้ใช้งาน <small>{users.length} บัญชี</small>
          </h2>
          <button
            className="primary"
            onClick={() => {
              setError("");
              openEditor({
                username: "",
                name: "",
                password: "",
                role: "staff",
                permissions: ["view", "create", "edit"],
                villages: [],
                active: true,
              });
            }}
          >
            <Plus size={17} />
            เพิ่มผู้ใช้งาน
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ชื่อผู้ใช้</th>
                <th>ชื่อผู้ใช้งาน</th>
                <th>บทบาท</th>
                <th>หมู่บ้าน</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.name}</td>
                  <td>{u.role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"}</td>
                  <td>
                    {u.role === "admin"
                      ? "ทุกหมู่บ้าน"
                      : u.villages.map((v) => "ม." + v).join(", ") ||
                        "ยังไม่กำหนด"}
                  </td>
                  <td>
                    <span className={"badge " + (u.active ? "done" : "none")}>
                      {u.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        onClick={() => {
                          setError("");
                          openEditor({ ...u });
                        }}
                      >
                        <Pencil size={16} />
                        แก้ไขสิทธิ์
                      </button>
                      {u.id !== me.id && (
                        <button
                          disabled={!u.active}
                          onClick={() => {
                            setError("");
                            setReset(u);
                          }}
                          aria-label={"รีเซ็ตรหัสผ่าน " + u.username}
                        >
                          <KeyRound size={16} />
                          รีเซ็ตรหัสผ่าน
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {edit && (
        <Modal
          title={edit.id ? "แก้ไขบัญชีและสิทธิ์" : "เพิ่มบัญชีผู้ใช้งาน"}
          closeDisabled={busy}
          onClose={closeEditor}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                await api("/users", edit.id ? "PUT" : "POST", edit);
                setEdit(null);
                load();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ErrorBox error={error} />
            <fieldset disabled={busy}>
              <div className="form-grid">
                <Field
                  label="ชื่อผู้ใช้ · a–z, 0–9, จุด, ขีด"
                  value={edit.username}
                  required
                  pattern="[a-zA-Z0-9._-]{3,50}"
                  onChange={(e) => change("username", e.target.value)}
                />
                <Field
                  label="ชื่อแสดงในระบบ"
                  value={edit.name}
                  required
                  onChange={(e) => change("name", e.target.value)}
                />
                <Select
                  label="บทบาท"
                  value={edit.role}
                  onChange={(e) => change("role", e.target.value)}
                  disabled={edit.id === me.id}
                >
                  <option value="staff">เจ้าหน้าที่</option>
                  <option value="admin">ผู้ดูแลระบบ</option>
                </Select>
                {!edit.id && (
                  <Field
                    label="รหัสผ่านชั่วคราว · อย่างน้อย 12 ตัวอักษร"
                    type="password"
                    value={edit.password}
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    onChange={(e) => change("password", e.target.value)}
                  />
                )}
              </div>
              {edit.role === "staff" && (
                <>
                  <h3>สิทธิ์การใช้งาน</h3>
                  <div className="checkbox-grid">
                    {permissions.map((p, i) => (
                      <label key={p}>
                        <input
                          type="checkbox"
                          checked={edit.permissions.includes(p)}
                          onChange={(e) =>
                            change(
                              "permissions",
                              e.target.checked
                                ? [...edit.permissions, p]
                                : edit.permissions.filter((x) => x !== p),
                            )
                          }
                        />
                        {permissionLabels[i]}
                      </label>
                    ))}
                  </div>
                  <h3>หมู่บ้านที่เข้าถึงข้อมูลรายบุคคล</h3>
                  <button
                    type="button"
                    onClick={() =>
                      change(
                        "villages",
                        edit.villages.length === config.villages.length
                          ? []
                          : config.villages.map((v) => v.id),
                      )
                    }
                  >
                    เลือก / ล้างทั้งหมด
                  </button>
                  <div className="checkbox-grid">
                    {config.villages.map((v) => (
                      <label key={v.id}>
                        <input
                          type="checkbox"
                          checked={edit.villages.includes(v.id)}
                          onChange={(e) =>
                            change(
                              "villages",
                              e.target.checked
                                ? [...edit.villages, v.id]
                                : edit.villages.filter((x) => x !== v.id),
                            )
                          }
                        />
                        ม.{v.id} บ้าน{v.name}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {edit.id && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={edit.active}
                    disabled={edit.id === me.id}
                    onChange={(e) => change("active", e.target.checked)}
                  />
                  เปิดใช้งานบัญชี
                </label>
              )}
              <p className="notice">
                การรีเซ็ตรหัสผ่านใช้ปุ่มรีเซ็ตในตารางบัญชีผู้ใช้
                การปิดใช้งานบัญชีจะเก็บประวัติการทำรายการไว้
              </p>
            </fieldset>
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={closeEditor}>
                ยกเลิก
              </button>
              <button className="primary" disabled={busy}>
                บันทึกบัญชี
              </button>
            </div>
          </form>
        </Modal>
      )}
      {reset && (
        <ResetPasswordDialog
          user={reset}
          onClose={() => setReset(null)}
          onSaved={() => {
            setNotice(
              "รีเซ็ตรหัสผ่านให้ " +
                reset.username +
                " แล้ว ผู้ใช้ต้องตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบ",
            );
            setReset(null);
            load();
          }}
        />
      )}
      {confirmClose && (
        <ConfirmDialog
          title="ยังมีข้อมูลที่ไม่ได้บันทึก"
          description="ข้อมูลบัญชีและสิทธิ์ที่แก้ไขยังไม่ได้บันทึก ต้องการละทิ้งหรือไม่?"
          confirmText="ละทิ้งการเปลี่ยนแปลง"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            setEdit(null);
          }}
        />
      )}
    </>
  );
}
export function SystemSettings({ config, onSaved }) {
  const [c, setC] = useState(() => structuredClone(config)),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("general");
  const snapshot = useRef(JSON.stringify(config));
  const [confirmReload, setConfirmReload] = useState(false);
  const dirty = JSON.stringify(c) !== snapshot.current;
  useUnsavedChanges(dirty);
  async function reload() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const latest = await api("/config");
      setC(latest);
      snapshot.current = JSON.stringify(latest);
      onSaved(latest);
      setConfirmReload(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const latest = await api("/config", "PUT", c);
      setC(latest);
      snapshot.current = JSON.stringify(latest);
      onSaved(latest);
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="tabs settings-tabs">
        {[
          ["general", "ข้อมูลระบบ"],
          ["villages", "หมู่บ้าน"],
          ["types", "ประเภทความช่วยเหลือ"],
          ["audit", "ประวัติการใช้งาน"],
        ].map(([id, l]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "audit" ? (
        <AuditHistory />
      ) : (
        <section className="panel">
          <form onSubmit={save}>
            <ErrorBox error={error} />
            {saved && !dirty && (
              <p role="status" className="success">
                บันทึกการตั้งค่าเรียบร้อยแล้ว
              </p>
            )}
            <fieldset disabled={busy}>
              {tab === "general" ? (
                <>
                  <h2>ข้อมูลทั่วไป</h2>
                  <Field
                    label="ชื่อระบบ"
                    value={c.name}
                    required
                    onChange={(e) => setC({ ...c, name: e.target.value })}
                  />
                  <Field label="โลโก้ระบบ · PNG, JPEG, WebP ไม่เกิน 200 KB">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const f = e.target.files[0];
                        if (!f) return;
                        if (f.size > 200000) {
                          setError("โลโก้ต้องไม่เกิน 200 KB");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () =>
                          setC({ ...c, logo: reader.result });
                        reader.readAsDataURL(f);
                      }}
                    />
                  </Field>
                  {c.logo && (
                    <div className="actions">
                      <img
                        className="logo-preview"
                        src={c.logo}
                        alt="ตัวอย่างโลโก้"
                      />
                      <button
                        type="button"
                        onClick={() => setC({ ...c, logo: "" })}
                      >
                        ลบโลโก้
                      </button>
                    </div>
                  )}
                  <p className="muted">
                    กองสวัสดิการสังคม องค์การบริหารส่วนตำบลบ้านเสด็จ
                  </p>
                </>
              ) : tab === "villages" ? (
                <>
                  <h2>หมู่บ้านในตำบลบ้านเสด็จ</h2>
                  <p className="notice">
                    การปิดใช้งานจะซ่อนหมู่บ้านจากการเพิ่มทะเบียนใหม่
                    โดยเก็บข้อมูลเดิมและประวัติไว้
                  </p>
                  {c.villages.map((v, i) => (
                    <div className="setting-row" key={v.id}>
                      <strong>หมู่ {v.id}</strong>
                      <input
                        aria-label={"ชื่อหมู่ " + v.id}
                        value={v.name}
                        required
                        onChange={(e) =>
                          setC({
                            ...c,
                            villages: c.villages.map((x, j) =>
                              i === j ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={v.active}
                          onChange={(e) =>
                            setC({
                              ...c,
                              villages: c.villages.map((x, j) =>
                                i === j
                                  ? { ...x, active: e.target.checked }
                                  : x,
                              ),
                            })
                          }
                        />
                        ใช้งาน
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setC({
                        ...c,
                        villages: [
                          ...c.villages,
                          {
                            id: Math.max(...c.villages.map((v) => v.id)) + 1,
                            name: "หมู่บ้านใหม่",
                            active: true,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={16} />
                    เพิ่มหมู่บ้าน
                  </button>
                </>
              ) : tab === "types" ? (
                <>
                  <h2>ประเภทความช่วยเหลือ</h2>
                  <p className="notice">
                    แก้ไขรายการประเภทได้ หมวดหมู่หลักคงเดิม
                    การแก้ไขไม่เปลี่ยนประวัติคำขอที่บันทึกไว้แล้ว
                    ระบบตัดช่องว่าง บรรทัดว่าง และรายการซ้ำเมื่อบันทึก
                  </p>
                  {c.types.map((t, i) => (
                    <Field
                      key={t.id}
                      label={categories[i] + " · หนึ่งประเภทต่อหนึ่งบรรทัด"}
                    >
                      <textarea
                        rows={Math.max(3, t.items.length)}
                        value={t.items.join("\n")}
                        onChange={(e) =>
                          setC({
                            ...c,
                            types: c.types.map((x, j) =>
                              i === j
                                ? { ...x, items: e.target.value.split("\n") }
                                : x,
                            ),
                          })
                        }
                      />
                    </Field>
                  ))}
                </>
              ) : null}
            </fieldset>
            {tab !== "audit" && (
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (dirty ? setConfirmReload(true) : reload())}
                >
                  โหลดค่าล่าสุด
                </button>
                <button className="primary" disabled={busy}>
                  <Save size={17} />
                  {busy ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
                </button>
              </div>
            )}
          </form>
        </section>
      )}
      {confirmReload && (
        <ConfirmDialog
          title="โหลดการตั้งค่าล่าสุด"
          description="ข้อมูลที่แก้ไขและยังไม่บันทึกจะถูกแทนที่ด้วยค่าล่าสุดในระบบ"
          confirmText="ละทิ้งและโหลดใหม่"
          onCancel={() => setConfirmReload(false)}
          onConfirm={reload}
        />
      )}
    </>
  );
}

function ResetPasswordDialog({ user, onClose, onSaved }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    setError("");
    if (b.password !== b.confirm) {
      setError("รหัสผ่านชั่วคราวไม่ตรงกัน");
      return;
    }
    setBusy(true);
    try {
      await api("/users/" + user.id + "/reset-password", "POST", {
        password: b.password,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={"รีเซ็ตรหัสผ่าน · " + user.username}
      closeDisabled={busy}
      onClose={() => !busy && onClose()}
    >
      <p className="notice">
        รหัสผ่านเดิมจะใช้ไม่ได้และระบบจะออกจากระบบทุกอุปกรณ์
        ผู้ใช้ต้องเปลี่ยนรหัสผ่านชั่วคราวเมื่อเข้าสู่ระบบครั้งถัดไป
        กรุณาส่งรหัสผ่านให้เจ้าของบัญชีผ่านช่องทางที่เหมาะสม
      </p>
      <form onSubmit={save}>
        <ErrorBox error={error} />
        <fieldset disabled={busy}>
          <Field
            label="รหัสผ่านชั่วคราวใหม่"
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
          <Field
            label="ยืนยันรหัสผ่านชั่วคราว"
            name="confirm"
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
        </fieldset>
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            ยกเลิก
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "กำลังรีเซ็ต…" : "ยืนยันรีเซ็ตรหัสผ่าน"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
