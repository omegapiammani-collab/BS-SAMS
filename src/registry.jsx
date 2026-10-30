import React, { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
  Download,
  ChevronLeft,
  ChevronRight,
  Wallet,
  House,
  Landmark,
  HandHeart,
  Banknote,
  Accessibility,
  Ellipsis,
} from "lucide-react";
import { api } from "./api";
import {
  age,
  categories,
  disabilities,
  statuses,
  closed,
  personStatus,
  personLabels,
  validatePerson,
} from "./domain";
import { Field, Select, Modal, Empty, ErrorBox } from "./ui";
import { downloadRows } from "./reports";
const icons = [
  Wallet,
  House,
  Landmark,
  HandHeart,
  Banknote,
  Accessibility,
  Ellipsis,
];
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(),
  );
const initial = () => ({
  title: "นาย",
  first: "",
  last: "",
  nationalId: "",
  birth: "",
  marital: "โสด",
  disabilities: [],
  phone: "",
  houseCode: "",
  house: "",
  village: 1,
  requests: [],
});
const can = (u, p, v) =>
  u.role === "admin" ||
  (u.permissions.includes(p) && u.villages.includes(Number(v)));
export function Registry({ user, config, refresh }) {
  const [data, setData] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [trash, setTrash] = useState(false),
    [q, setQ] = useState(""),
    [village, setVillage] = useState(""),
    [status, setStatus] = useState(""),
    [cat, setCat] = useState(""),
    [filters, setFilters] = useState({}),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [sort, setSort] = useState("name"),
    [ascending, setAscending] = useState(true),
    [editor, setEditor] = useState(null),
    [readonly, setReadonly] = useState(false),
    [deleting, setDeleting] = useState(null),
    [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true);
    try {
      setData(await api("/people" + (trash ? "?trash=1" : "")));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [trash]);
  const visible = data
    .filter(
      (p) =>
        (!filters.q ||
          `${p.first} ${p.last} ${p.nationalId} ${p.id}`.includes(filters.q)) &&
        (!filters.village || p.village === Number(filters.village)) &&
        (!filters.status || personStatus(p) === filters.status) &&
        (!filters.cat || p.requests.some((r) => r.category === filters.cat)),
    )
    .sort(
      (a, b) =>
        (ascending ? 1 : -1) *
        (sort === "village"
          ? a.village - b.village
          : (a.first + a.last).localeCompare(b.first + b.last, "th")),
    );
  const pages = Math.max(1, Math.ceil(visible.length / size));
  const currentPage = Math.min(page, pages);
  function clear() {
    setQ("");
    setVillage("");
    setStatus("");
    setCat("");
    setFilters({});
    setPage(1);
  }
  async function exportData(f) {
    try {
      setBusy(true);
      const list = await api("/export", "POST", {
        ids: visible.map((p) => p.id),
      });
      await downloadRows(
        [
          [
            "เลขทะเบียน",
            "คำนำหน้า",
            "ชื่อ",
            "นามสกุล",
            "เลขบัตรประชาชน",
            "วันเกิด",
            "อายุ",
            "หมู่ที่",
            "โทรศัพท์",
            "สถานะ",
          ],
          ...list.map((p) => [
            p.id,
            p.title,
            p.first,
            p.last,
            p.nationalId,
            p.birth,
            age(p.birth),
            p.village,
            p.phone,
            personLabels[personStatus(p)],
          ]),
        ],
        f,
        "ทะเบียนผู้ประสบปัญหา",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="registry-toolbar">
        <div className="tabs">
          <button
            className={!trash ? "selected" : ""}
            onClick={() => {
              setTrash(false);
              setPage(1);
            }}
          >
            ทะเบียนผู้ประสบปัญหา
          </button>
          {user.role === "admin" && (
            <button
              className={trash ? "selected" : ""}
              onClick={() => {
                setTrash(true);
                setPage(1);
              }}
            >
              ถังขยะ
            </button>
          )}
        </div>
        <div className="actions">
          {!trash && (
            <>
              <button
                disabled={
                  busy || !data.some((p) => can(user, "export", p.village))
                }
                onClick={() => exportData("csv")}
              >
                <Download size={16} />
                CSV
              </button>
              <button
                disabled={
                  busy || !data.some((p) => can(user, "export", p.village))
                }
                onClick={() => exportData("xlsx")}
              >
                Excel
              </button>
              {(user.role === "admin" ||
                (user.permissions.includes("create") &&
                  user.permissions.includes("view") &&
                  user.villages.length > 0)) && (
                <button
                  className="primary"
                  onClick={() => {
                    setReadonly(false);
                    setEditor({
                      ...initial(),
                      village: user.role === "admin" ? 1 : user.villages[0],
                    });
                  }}
                >
                  <Plus size={18} />
                  เพิ่มผู้ประสบปัญหา
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="registry-layout">
        <form
          className="panel filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ q, village, status, cat });
            setPage(1);
          }}
        >
          <h2>
            <Search size={18} />
            เงื่อนไขการค้นหา
          </h2>
          <Field
            label="ชื่อ นามสกุล / เลขบัตร / เลขทะเบียน"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาข้อมูลบุคคล"
          />
          <Select
            label="หมู่บ้าน"
            value={village}
            onChange={(e) => setVillage(e.target.value)}
          >
            <option value="">ทุกหมู่บ้านที่มีสิทธิ์</option>
            {config.villages
              .filter((v) => can(user, "view", v.id))
              .map((v) => (
                <option key={v.id} value={v.id}>
                  ม.{v.id} บ้าน{v.name}
                </option>
              ))}
          </Select>
          <Select
            label="ประเภทความช่วยเหลือ"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
          >
            <option value="">ทั้งหมด</option>
            {categories.map((c, i) => (
              <option key={c} value={String(i)}>
                {c}
              </option>
            ))}
          </Select>
          <Select
            label="สถานะการช่วยเหลือ"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">ทุกสถานะ</option>
            {Object.entries(personLabels).map(([s, l]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
          </Select>
          <div className="filter-actions">
            <button type="button" onClick={clear}>
              ล้างตัวกรอง
            </button>
            <button className="primary">
              <Search size={16} />
              ค้นหา
            </button>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              clear();
              load();
            }}
          >
            รีเซ็ตมุมมองและโหลดข้อมูลใหม่
          </button>
        </form>
        <section className="panel results">
          <div className="panel-title">
            <h2>{trash ? "ข้อมูลในถังขยะ" : "รายการผู้ประสบปัญหา"}</h2>
            <span className="small muted">
              {visible.length.toLocaleString("th-TH")} รายการ
            </span>
          </div>
          <ErrorBox error={error} />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>สถานะการช่วยเหลือ</th>
                  <th>
                    <button
                      className="th-button"
                      onClick={() => {
                        setAscending(sort === "name" ? !ascending : true);
                        setSort("name");
                      }}
                    >
                      ชื่อ–นามสกุล ↕
                    </button>
                  </th>
                  <th>
                    <button
                      className="th-button"
                      onClick={() => {
                        setAscending(sort === "village" ? !ascending : true);
                        setSort("village");
                      }}
                    >
                      หมู่บ้าน ↕
                    </button>
                  </th>
                  <th>ประเภทความช่วยเหลือ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {visible
                  .slice((currentPage - 1) * size, currentPage * size)
                  .map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className={"badge " + personStatus(p)}>
                          {personLabels[personStatus(p)]}
                        </span>
                        {trash && (
                          <small className="block muted">
                            ลบโดย {p.deletedBy}
                            <br />
                            {p.deleteReason}
                          </small>
                        )}
                      </td>
                      <td>
                        <strong>
                          {p.title}
                          {p.first} {p.last}
                        </strong>
                        <small className="block muted">
                          อายุ {age(p.birth) ?? "ไม่ระบุ"} ปี
                        </small>
                      </td>
                      <td>
                        ม.{p.village}
                        <small className="block muted">
                          บ้าน
                          {
                            config.villages.find((v) => v.id === p.village)
                              ?.name
                          }
                        </small>
                      </td>
                      <td>
                        <div className="category-icons">
                          {categories.map((c, i) => {
                            const Icon = icons[i];
                            const rs = p.requests.filter(
                              (r) => Number(r.category) === i,
                            );
                            const s = personStatus({ requests: rs });
                            return (
                              <span
                                key={c}
                                tabIndex={0}
                                className={"category-icon " + s}
                                title={`${c}: ${personLabels[s]}`}
                                aria-label={`${c}: ${personLabels[s]}`}
                              >
                                <Icon size={16} />
                                <span className="tooltip">
                                  {c} · {personLabels[s]}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        <div className="actions">
                          {trash ? (
                            <button
                              title="กู้คืน"
                              onClick={async () => {
                                try {
                                  await api(
                                    `/people/${p.id}/restore`,
                                    "POST",
                                    {},
                                  );
                                  load();
                                  refresh();
                                } catch (e) {
                                  setError(e.message);
                                }
                              }}
                            >
                              <RotateCcw size={17} />
                              กู้คืน
                            </button>
                          ) : (
                            <>
                              <button
                                className="icon"
                                aria-label={`ดู ${p.first}`}
                                onClick={() => {
                                  setReadonly(true);
                                  setEditor(p);
                                }}
                              >
                                <Eye size={17} />
                              </button>
                              {can(user, "edit", p.village) && (
                                <button
                                  className="icon"
                                  aria-label={`แก้ไข ${p.first}`}
                                  onClick={() => {
                                    setReadonly(false);
                                    setEditor(p);
                                  }}
                                >
                                  <Pencil size={17} />
                                </button>
                              )}
                              {can(user, "delete", p.village) && (
                                <button
                                  className="icon danger"
                                  aria-label={`ลบ ${p.first}`}
                                  onClick={() => setDeleting(p)}
                                >
                                  <Trash2 size={17} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {loading ? (
            <p className="loading">กำลังโหลดข้อมูล…</p>
          ) : (
            !visible.length && (
              <Empty
                text={
                  data.length
                    ? "ไม่พบข้อมูลตามเงื่อนไข"
                    : "ยังไม่มีข้อมูลในรายการนี้"
                }
              >
                <p>เพิ่มข้อมูลใหม่ หรือปรับเงื่อนไขการค้นหา</p>
              </Empty>
            )
          )}
          <div className="pagination">
            <span>ทั้งหมด {visible.length} รายการ</span>
            <label>
              แสดง{" "}
              <select
                value={size}
                onChange={(e) => {
                  setSize(+e.target.value);
                  setPage(1);
                }}
              >
                {[10, 25, 50].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              aria-label="หน้าก่อน"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {currentPage} / {pages}
            </span>
            <button
              aria-label="หน้าถัดไป"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </section>
      </div>
      <div className="status-legend">
        {[
          ["none", "ไม่มีปัญหา"],
          ["pending", "ยังไม่ได้ดำเนินการ"],
          ["progress", "อยู่ระหว่างช่วยเหลือ"],
          ["done", "ช่วยเหลือแล้ว"],
        ].map(([s, l]) => (
          <span key={s}>
            <i className={s} />
            {l}
          </span>
        ))}
      </div>
      {editor && (
        <PersonEditor
          person={editor}
          readonly={readonly}
          config={config}
          user={user}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            load();
            refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title="ย้ายข้อมูลเข้าถังขยะ" onClose={() => setDeleting(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setBusy(true);
                await api(
                  "/people/" + deleting.id,
                  "DELETE",
                  Object.fromEntries(new FormData(e.target)),
                );
                setDeleting(null);
                load();
                refresh();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {deleting.first} {deleting.last}{" "}
              พร้อมคำขอและประวัติการช่วยเหลือจะถูกซ่อน ผู้ดูแลกู้คืนได้
            </p>
            <Field label="เหตุผลการลบ" name="reason" required />
            <div className="modal-actions">
              <button type="button" onClick={() => setDeleting(null)}>
                ยกเลิก
              </button>
              <button className="danger-button" disabled={busy}>
                ย้ายเข้าถังขยะ
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function PersonEditor({ person, readonly, config, user, onClose, onSaved }) {
  const [p, setP] = useState(() => structuredClone(person)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (key, value) => setP({ ...p, [key]: value });
  const changeRequest = (id, key, val) =>
    update(
      "requests",
      p.requests.map((r) => (r.id === id ? { ...r, [key]: val } : r)),
    );
  async function save(e) {
    e.preventDefault();
    setError("");
    const err = validatePerson(p, config);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    try {
      await api(p.id ? "/people/" + p.id : "/people", p.id ? "PUT" : "POST", p);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const input = (label, key, type = "text", required = false) => (
    <Field
      key={key}
      label={label}
      type={type}
      value={p[key] || ""}
      onChange={(e) => update(key, e.target.value)}
      required={required}
      max={type === "date" ? today() : undefined}
    />
  );
  return (
    <Modal
      title={
        readonly
          ? "รายละเอียดผู้ประสบปัญหา"
          : p.id
            ? "แก้ไขทะเบียนผู้ประสบปัญหา"
            : "เพิ่มผู้ประสบปัญหาทางสังคม"
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <ErrorBox error={error} />
        <fieldset disabled={readonly || busy}>
          <h3 className="section-title">ข้อมูลส่วนบุคคล</h3>
          <div className="form-grid">
            {input("เลขบัตรประชาชน · ไม่บังคับ", "nationalId")}
            <Select
              label="คำนำหน้า"
              value={p.title}
              onChange={(e) => update("title", e.target.value)}
            >
              {["นาย", "นาง", "นางสาว", "เด็กชาย", "เด็กหญิง", "อื่น ๆ"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </Select>
            {input("ชื่อ *", "first", "text", true)}
            {input("นามสกุล *", "last", "text", true)}
            {input("วันเดือนปีเกิด · ค.ศ.", "birth", "date")}
            <Field label="อายุ">
              <input
                value={age(p.birth) === null ? "ไม่ระบุ" : `${age(p.birth)} ปี`}
                readOnly
              />
            </Field>
            <Select
              label="สถานภาพ"
              value={p.marital}
              onChange={(e) => update("marital", e.target.value)}
            >
              {[
                "โสด",
                "สมรสอยู่ด้วยกัน",
                "สมรสแยกกันอยู่",
                "ไม่สมรสแต่อยู่ด้วยกัน",
                "หม้าย (คู่สมรสเสียชีวิต)",
                "หย่าร้าง",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
            {input("โทรศัพท์มือถือ", "phone", "tel")}
          </div>
          <Field label="ความพิการ">
            <div className="checkbox-grid">
              <label>
                <input
                  type="checkbox"
                  checked={!p.disabilities.length}
                  onChange={() => update("disabilities", [])}
                />
                ไม่มีความพิการ
              </label>
              {disabilities.map((d) => (
                <label key={d}>
                  <input
                    type="checkbox"
                    checked={p.disabilities.includes(d)}
                    onChange={(e) =>
                      update(
                        "disabilities",
                        e.target.checked
                          ? [...p.disabilities, d]
                          : p.disabilities.filter((x) => x !== d),
                      )
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </Field>
          <h3 className="section-title">ที่อยู่ปัจจุบัน</h3>
          <div className="form-grid">
            {input("รหัสประจำบ้าน", "houseCode")}
            {input("บ้านเลขที่", "house")}
            <Select
              label="หมู่บ้าน *"
              value={p.village}
              onChange={(e) => update("village", +e.target.value)}
            >
              {config.villages
                .filter(
                  (v) =>
                    v.id === p.village ||
                    (v.active &&
                      can(user, p.id ? "edit" : "create", v.id) &&
                      can(user, "view", v.id)),
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    หมู่ {v.id} บ้าน{v.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="panel-title section-title">
            <h3>สรุปสภาพปัญหาและคำขอรับความช่วยเหลือ</h3>
            {!readonly && (
              <button
                type="button"
                onClick={() =>
                  update("requests", [
                    ...p.requests,
                    {
                      id: crypto.randomUUID(),
                      category: "0",
                      type: "",
                      note: "",
                      date: today(),
                      status: "pending",
                      reason: "",
                      payments: [],
                    },
                  ])
                }
              >
                <Plus size={16} />
                เพิ่มคำขอ
              </button>
            )}
          </div>
          {!p.requests.length && (
            <p className="muted">ยังไม่มีคำขอรับความช่วยเหลือ</p>
          )}
          {p.requests.map((r, index) => (
            <section className="request-card" key={r.id}>
              <div className="panel-title">
                <h3>
                  คำขอที่ {index + 1} · {categories[Number(r.category)]}
                </h3>
                <span className={"badge " + r.status}>
                  {statuses[r.status]}
                </span>
              </div>
              <div className="form-grid">
                <Select
                  label="หมวดหมู่"
                  value={r.category}
                  onChange={(e) => {
                    update(
                      "requests",
                      p.requests.map((x) =>
                        x.id === r.id
                          ? { ...x, category: e.target.value, type: "" }
                          : x,
                      ),
                    );
                  }}
                >
                  {categories.map((c, i) => (
                    <option key={c} value={String(i)}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Field label="ประเภทความช่วยเหลือ *">
                  <input
                    list={"types-" + r.id}
                    value={r.type}
                    required
                    onChange={(e) =>
                      changeRequest(r.id, "type", e.target.value)
                    }
                  />
                  <datalist id={"types-" + r.id}>
                    {config.types[Number(r.category)].items.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </datalist>
                </Field>
                <Field label="วันที่ยื่นคำขอ · ค.ศ.">
                  <input
                    type="date"
                    value={r.date}
                    required
                    onChange={(e) =>
                      changeRequest(r.id, "date", e.target.value)
                    }
                  />
                </Field>
                <Select
                  label="สถานะ"
                  value={r.status}
                  onChange={(e) =>
                    changeRequest(r.id, "status", e.target.value)
                  }
                >
                  {Object.entries(statuses).map(([s, l]) => (
                    <option key={s} value={s}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <Field label="บันทึกสภาพปัญหาและรายละเอียดคำขอ">
                <textarea
                  value={r.note}
                  onChange={(e) => changeRequest(r.id, "note", e.target.value)}
                />
              </Field>
              {closed.includes(r.status) && (
                <Field label="เหตุผลยุติคำขอ *">
                  <textarea
                    value={r.reason}
                    required
                    onChange={(e) =>
                      changeRequest(r.id, "reason", e.target.value)
                    }
                  />
                </Field>
              )}
              <details open>
                <summary>
                  ประวัติการช่วยเหลือ · {r.payments.length} ครั้ง
                </summary>
                {r.payments.map((x, i) => (
                  <div className="payment" key={x.id}>
                    <strong>ครั้งที่ {i + 1}</strong>
                    <div className="form-grid">
                      {[
                        ["วันที่ได้รับ", "date", "date"],
                        ["หน่วยงานผู้ให้ *", "provider", "text"],
                        ["จำนวนเงิน · บาท", "amount", "number"],
                        ["จำนวนสิ่งของ", "quantity", "number"],
                        ["หน่วยนับ", "unit", "text"],
                      ].map(([label, key, type]) => (
                        <Field
                          key={key}
                          label={label}
                          type={type}
                          min={type === "number" ? 0 : undefined}
                          step={key === "amount" ? "0.01" : undefined}
                          value={x[key] ?? ""}
                          required={["date", "provider"].includes(key)}
                          onChange={(e) =>
                            changeRequest(
                              r.id,
                              "payments",
                              r.payments.map((y) =>
                                y.id === x.id
                                  ? { ...y, [key]: e.target.value }
                                  : y,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                    <Field label="รายละเอียดความช่วยเหลือ *">
                      <textarea
                        value={x.detail}
                        required
                        onChange={(e) =>
                          changeRequest(
                            r.id,
                            "payments",
                            r.payments.map((y) =>
                              y.id === x.id
                                ? { ...y, detail: e.target.value }
                                : y,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                ))}
                {!readonly && (
                  <button
                    type="button"
                    onClick={() =>
                      changeRequest(r.id, "payments", [
                        ...r.payments,
                        {
                          id: crypto.randomUUID(),
                          date: today(),
                          provider: "",
                          detail: "",
                          amount: "",
                          quantity: "",
                          unit: "",
                        },
                      ])
                    }
                  >
                    <Plus size={16} />
                    บันทึกการช่วยเหลือ
                  </button>
                )}
              </details>
            </section>
          ))}
        </fieldset>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {readonly ? "ปิด" : "ยกเลิก"}
          </button>
          {!readonly && (
            <button className="primary" disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
