import { personExport } from "./person-export.js";
import { orderRequests } from "./request-order.js";
import { formatThaiDate } from "./thai-date.js";
import React, { useEffect, useState, useRef } from "react";
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
import { Field, Select, Modal, Empty, ErrorBox, ConfirmDialog } from "./ui";
import { downloadRows } from "./reports";
import { formatMoney, sumMoney, thailandDate } from "./money";
import { useUnsavedChanges } from "./use-unsaved-changes";
const icons = [
  Wallet,
  House,
  Landmark,
  HandHeart,
  Banknote,
  Accessibility,
  Ellipsis,
];
const today = thailandDate;
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
    [total, setTotal] = useState(0),
    [reload, setReload] = useState(0),
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
  const requestVersion = useRef(0);
  const params = new URLSearchParams({
    ...filters,
    page: String(page),
    size: String(size),
    sort,
    direction: ascending ? "asc" : "desc",
    trash: trash ? "1" : "0",
  });
  const queryString = params.toString();
  function load() {
    setReload((n) => n + 1);
  }
  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    setData([]);
    api("/people?" + queryString, "GET", undefined, {
      signal: controller.signal,
    })
      .then((result) => {
        if (version !== requestVersion.current) return;
        const last = Math.max(1, Math.ceil(result.total / size));
        if (page > last) {
          setPage(last);
          return;
        }
        setData(result.items);
        setTotal(result.total);
      })
      .catch((e) => {
        if (e.name !== "AbortError" && version === requestVersion.current) {
          setError(e.message);
          setTotal(0);
        }
      })
      .finally(() => {
        if (version === requestVersion.current && !controller.signal.aborted)
          setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [queryString, reload]);
  const visible = data;
  const pages = Math.max(1, Math.ceil(total / size));
  const currentPage = page;
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
        filters: { ...filters, sort, direction: ascending ? "asc" : "desc" },
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
              {["csv", "xlsx", "pdf"].map((format) => (
                <button
                  key={format}
                  disabled={
                    busy ||
                    loading ||
                    total === 0 ||
                    (user.role !== "admin" &&
                      !user.permissions.includes("export"))
                  }
                  onClick={() => exportData(format)}
                >
                  <Download size={16} />
                  {format === "xlsx" ? "EXCEL" : format.toUpperCase()}
                </button>
              ))}
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
              {total.toLocaleString("th-TH")} รายการ
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
                {visible.map((p) => (
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
                        {config.villages.find((v) => v.id === p.village)?.name}
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
            !error &&
            !visible.length && (
              <Empty
                text={
                  Object.values(filters).some(Boolean)
                    ? "ไม่พบข้อมูลตามเงื่อนไข"
                    : "ยังไม่มีข้อมูลในรายการนี้"
                }
              >
                <p>เพิ่มข้อมูลใหม่ หรือปรับเงื่อนไขการค้นหา</p>
              </Empty>
            )
          )}
          <div className="pagination">
            <span>ทั้งหมด {total} รายการ</span>
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
              disabled={loading || currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {currentPage} / {pages}
            </span>
            <button
              aria-label="หน้าถัดไป"
              disabled={loading || currentPage >= pages}
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
  const [confirm, setConfirm] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);
  useEffect(() => {
    if (!activeRequest) return;
    const heading = document.getElementById("request-" + activeRequest);
    heading?.focus();
    heading?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeRequest]);
  function addRequest(category) {
    const id = crypto.randomUUID();
    update("requests", [
      ...p.requests,
      {
        id,
        category,
        type: "",
        note: "",
        date: today(),
        status: "pending",
        reason: "",
        payments: [],
      },
    ]);
    setActiveRequest(id);
  }
  const original = useRef(JSON.stringify(person));
  const errorRef = useRef(null);
  const dirty = !readonly && JSON.stringify(p) !== original.current;
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);
  const canDeleteSaved =
    user.role === "admin" ||
    (user.permissions.includes("delete") &&
      user.villages.includes(Number(person.village)));
  const savedRequests = new Set(person.requests.map((r) => r.id));
  const savedPayments = new Set(
    person.requests.flatMap((r) => r.payments.map((x) => x.id)),
  );
  function requestClose() {
    if (busy) return;
    if (dirty) setConfirm({ kind: "close" });
    else onClose();
  }
  function discard() {
    if (confirm.kind === "close") {
      onClose();
      return;
    }
    if (confirm.kind === "request") {
      setActiveRequest(p.requests.find((r) => r.id !== confirm.id)?.id || null);
      update(
        "requests",
        p.requests.filter((r) => r.id !== confirm.id),
      );
    }
    if (confirm.kind === "payment")
      update(
        "requests",
        p.requests.map((r) =>
          r.id === confirm.request
            ? {
                ...r,
                payments: r.payments.filter((x) => x.id !== confirm.id),
                status:
                  r.status === "done" && r.payments.length === 1
                    ? "pending"
                    : r.status,
              }
            : r,
        ),
      );
    setConfirm(null);
  }
  const update = (key, value) => setP({ ...p, [key]: value });
  const changeRequest = (id, key, val) =>
    update(
      "requests",
      p.requests.map((r) => (r.id === id ? { ...r, [key]: val } : r)),
    );
  async function save(e) {
    e.preventDefault();
    setError("");
    const err = validatePerson(p, config, undefined, person);
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
  async function exportPersonPdf() {
    setBusy(true);
    setError("");
    try {
      const saved = await api("/people/" + person.id + "/export", "POST", {});
      await downloadRows(
        personExport(saved, config),
        "pdf",
        "รายละเอียดผู้ประสบปัญหา-" + saved.id,
        { orientation: "portrait", title: "รายละเอียดผู้ประสบปัญหา" },
      );
    } catch (error) {
      setError(error.message);
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
    <>
      <Modal
        title={
          readonly
            ? "รายละเอียดผู้ประสบปัญหา"
            : p.id
              ? "แก้ไขทะเบียนผู้ประสบปัญหา"
              : "เพิ่มผู้ประสบปัญหาทางสังคม"
        }
        onClose={requestClose}
        closeDisabled={busy}
        wide
      >
        {readonly &&
          person.id &&
          can(user, "view", person.village) &&
          can(user, "export", person.village) && (
            <div className="person-export-actions">
              <button type="button" disabled={busy} onClick={exportPersonPdf}>
                <Download size={16} />
                ส่งออก PDF รายบุคคล
              </button>
            </div>
          )}
        <form onSubmit={save}>
          <div ref={errorRef} tabIndex={-1}>
            <ErrorBox error={error} />
          </div>
          <fieldset disabled={busy}>
            <fieldset disabled={readonly}>
              <h3 className="section-title">ข้อมูลส่วนบุคคล</h3>
              <div className="form-grid">
                {input("เลขบัตรประชาชน · ไม่บังคับ", "nationalId")}
                <Select
                  label="คำนำหน้า"
                  value={p.title}
                  onChange={(e) => update("title", e.target.value)}
                >
                  {[
                    "นาย",
                    "นาง",
                    "นางสาว",
                    "เด็กชาย",
                    "เด็กหญิง",
                    "อื่น ๆ",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
                {input("ชื่อ *", "first", "text", true)}
                {input("นามสกุล *", "last", "text", true)}
                {input("วันเดือนปีเกิด · พ.ศ.", "birth", "date")}
                <Field label="อายุ">
                  <input
                    value={
                      age(p.birth) === null ? "ไม่ระบุ" : `${age(p.birth)} ปี`
                    }
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
            </fieldset>
            <div className="panel-title section-title">
              <h3>สรุปสภาพปัญหาและคำขอรับความช่วยเหลือ</h3>
            </div>
            {!p.requests.length && (
              <p className="muted">ยังไม่มีคำขอรับความช่วยเหลือ</p>
            )}
            <div
              className="request-groups"
              aria-label="สรุปคำขอ"
              id="request-summary"
            >
              {categories.map((category, categoryIndex) => {
                const requests = orderRequests(
                  p.requests.filter(
                    (r) => Number(r.category) === categoryIndex,
                  ),
                );
                return (
                  <details className="request-group" key={category} open>
                    <summary>
                      {category}
                      <span>{requests.length} คำขอ</span>
                    </summary>
                    {!readonly && (
                      <div className="request-group-actions">
                        <button
                          type="button"
                          aria-label={`เพิ่มคำขอ ${category}`}
                          onClick={() => addRequest(String(categoryIndex))}
                        >
                          <Plus size={16} />
                          เพิ่มคำขอ
                        </button>
                      </div>
                    )}
                    {requests.length ? (
                      <div className="request-grid">
                        {requests.map((r, position) => {
                          const index = p.requests.findIndex(
                            (x) => x.id === r.id,
                          );
                          const total = sumMoney(r.payments);
                          const occurrence = requests
                            .slice(0, position + 1)
                            .filter(
                              (x) =>
                                x.category === r.category && x.type === r.type,
                            ).length;
                          return (
                            <button
                              type="button"
                              key={r.id}
                              className={
                                "request-tile" +
                                (activeRequest === r.id ? " selected" : "")
                              }
                              aria-label={`ไปที่คำขอที่ ${index + 1}`}
                              aria-expanded={activeRequest === r.id}
                              aria-controls={
                                activeRequest === r.id
                                  ? "request-form-" + r.id
                                  : undefined
                              }
                              onClick={() => {
                                setActiveRequest(r.id);
                                if (activeRequest === r.id)
                                  document
                                    .getElementById("request-" + r.id)
                                    ?.scrollIntoView({ block: "start" });
                              }}
                            >
                              <span className="request-tile-title">
                                {r.type || "คำขอใหม่ · ยังไม่ระบุประเภท"}
                              </span>
                              <span className="request-tile-body">
                                <span className="request-date">
                                  ยื่นคำขอ {formatThaiDate(r.date)}
                                </span>
                                <span className="request-occurrence">
                                  ครั้งที่ {occurrence} ของประเภทนี้
                                </span>
                                <span className={"badge " + r.status}>
                                  {statuses[r.status]}
                                </span>
                                {!!r.payments.length && (
                                  <span className="request-received-date">
                                    ได้รับการช่วยเหลือ{" "}
                                    {[
                                      ...new Set(
                                        r.payments.map((payment) =>
                                          formatThaiDate(payment.date),
                                        ),
                                      ),
                                    ].join(", ")}
                                  </span>
                                )}
                                <span className="request-tile-totals">
                                  ช่วยเหลือ {r.payments.length} ครั้ง
                                  <strong>
                                    {total === null
                                      ? "ตรวจสอบจำนวนเงิน"
                                      : formatMoney(total) + " บาท"}
                                  </strong>
                                </span>
                                <span className="request-tile-action">
                                  {readonly
                                    ? "ดูประวัติการช่วยเหลือ"
                                    : "เปิดบันทึกการช่วยเหลือ"}
                                  <ChevronRight size={16} />
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="request-group-empty">
                        ยังไม่มีคำขอในหมวดนี้
                      </p>
                    )}
                  </details>
                );
              })}
            </div>
            {p.requests.map((r, index) =>
              activeRequest === r.id ? (
                <section
                  className="request-card"
                  key={r.id}
                  id={"request-form-" + r.id}
                >
                  <div className="panel-title">
                    <h3 id={"request-" + r.id} tabIndex={-1}>
                      คำขอที่ {index + 1} · {categories[Number(r.category)]}
                      <small className="request-heading-date">
                        ยื่นคำขอ {formatThaiDate(r.date)}
                      </small>
                    </h3>
                    <div className="actions">
                      <span className={"badge " + r.status}>
                        {statuses[r.status]}
                      </span>
                      {!readonly &&
                        (canDeleteSaved || !savedRequests.has(r.id)) && (
                          <button
                            type="button"
                            className="danger"
                            aria-label={`ลบคำขอที่ ${index + 1}${savedRequests.has(r.id) ? "" : " ที่ยังไม่บันทึก"}`}
                            onClick={() =>
                              setConfirm({
                                kind: "request",
                                id: r.id,
                                saved: savedRequests.has(r.id),
                              })
                            }
                          >
                            <Trash2 size={15} />
                            {savedRequests.has(r.id)
                              ? "ลบคำขอ"
                              : "ลบรายการใหม่"}
                          </button>
                        )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="request-back"
                    onClick={() => {
                      setActiveRequest(null);
                      document
                        .getElementById("request-summary")
                        ?.scrollIntoView({ block: "start" });
                    }}
                  >
                    <ChevronLeft size={16} />
                    กลับไปสรุปคำขอ
                  </button>
                  <p className="muted">
                    แต่ละวันที่ยื่นให้สร้างคำขอใหม่
                    คำขอแต่ละรายการบันทึกการช่วยเหลือได้หนึ่งครั้ง
                    หากได้รับความช่วยเหลืออีกครั้งให้สร้างคำขอใหม่
                  </p>
                  <fieldset disabled={readonly}>
                    <div className="form-grid">
                      <Select
                        label="หมวดหมู่"
                        value={r.category}
                        disabled
                        title="หมวดหมู่ถูกกำหนดจากปุ่มเพิ่มคำขอและไม่สามารถเปลี่ยนได้"
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
                      <Field label="วันที่ยื่นคำขอ · พ.ศ.">
                        <input
                          type="date"
                          value={r.date}
                          min={p.birth || undefined}
                          max={today()}
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
                        onChange={(e) =>
                          changeRequest(r.id, "note", e.target.value)
                        }
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
                          <div className="panel-title">
                            <strong>ประวัติการช่วยเหลือ</strong>
                            {!readonly &&
                              (canDeleteSaved || !savedPayments.has(x.id)) && (
                                <button
                                  type="button"
                                  className="danger"
                                  aria-label={`ลบการช่วยเหลือครั้งที่ ${i + 1} ในคำขอที่ ${index + 1}${savedPayments.has(x.id) ? "" : " ที่ยังไม่บันทึก"}`}
                                  onClick={() =>
                                    setConfirm({
                                      kind: "payment",
                                      id: x.id,
                                      request: r.id,
                                      saved: savedPayments.has(x.id),
                                    })
                                  }
                                >
                                  <Trash2 size={15} />
                                  {savedPayments.has(x.id)
                                    ? "ลบประวัติการช่วยเหลือ"
                                    : "ลบรายการใหม่"}
                                </button>
                              )}
                          </div>
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
                                step={
                                  key === "amount"
                                    ? "0.01"
                                    : key === "quantity"
                                      ? "any"
                                      : undefined
                                }
                                max={
                                  key === "amount"
                                    ? 999999999.99
                                    : key === "date"
                                      ? today()
                                      : undefined
                                }
                                min={
                                  key === "date"
                                    ? r.date
                                    : type === "number"
                                      ? 0
                                      : undefined
                                }
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
                          <Field label="รายละเอียดความช่วยเหลือ">
                            <textarea
                              value={x.detail}
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
                      {!readonly && r.payments.length === 0 && (
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
                  </fieldset>
                </section>
              ) : null,
            )}
          </fieldset>
          <div className="modal-actions">
            <button type="button" disabled={busy} onClick={requestClose}>
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
      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === "close"
              ? "ยังมีข้อมูลที่ไม่ได้บันทึก"
              : "ลบรายการที่ยังไม่บันทึก"
          }
          description={
            confirm.kind === "close"
              ? "ข้อมูลที่แก้ไขในแบบฟอร์มนี้จะไม่ถูกบันทึก ต้องการละทิ้งการเปลี่ยนแปลงหรือไม่?"
              : confirm.saved
                ? confirm.kind === "request"
                  ? "คำขอและประวัติการช่วยเหลือของคำขอนี้จะถูกลบเมื่อกดบันทึกข้อมูล ต้องการลบหรือไม่?"
                  : "ประวัติการช่วยเหลือนี้จะถูกลบเมื่อกดบันทึกข้อมูล หากไม่เหลือประวัติ สถานะช่วยเหลือแล้วจะกลับเป็นยังไม่ได้ดำเนินการ ต้องการลบหรือไม่?"
                : "รายการนี้ยังไม่ถูกบันทึกในระบบ ต้องการลบออกจากแบบฟอร์มหรือไม่?"
          }
          confirmText={
            confirm.kind === "close"
              ? "ละทิ้งการเปลี่ยนแปลง"
              : confirm.saved
                ? "ยืนยันลบ"
                : "ลบรายการใหม่"
          }
          onCancel={() => setConfirm(null)}
          onConfirm={discard}
        />
      )}
    </>
  );
}
