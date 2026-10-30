import { PersonDetails } from "./person-details";
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
    [ageGroup, setAgeGroup] = useState(""),
    [disability, setDisability] = useState(""),
    [requestType, setRequestType] = useState(""),
    [requestFrom, setRequestFrom] = useState(""),
    [requestTo, setRequestTo] = useState(""),
    [filters, setFilters] = useState({}),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [sort, setSort] = useState("name"),
    [ascending, setAscending] = useState(true),
    [editor, setEditor] = useState(null),
    [selection, setSelection] = useState(null),
    [deleting, setDeleting] = useState(null),
    [restoring, setRestoring] = useState(null),
    [actionError, setActionError] = useState(""),
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
    setAgeGroup("");
    setDisability("");
    setRequestType("");
    setRequestFrom("");
    setRequestTo("");
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
              <button
                disabled={
                  busy ||
                  loading ||
                  total === 0 ||
                  (user.role !== "admin" &&
                    !user.permissions.includes("export"))
                }
                onClick={() => exportData("csv")}
              >
                <Download size={16} />
                CSV
              </button>
              <button
                disabled={
                  busy ||
                  loading ||
                  total === 0 ||
                  (user.role !== "admin" &&
                    !user.permissions.includes("export"))
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
                  disabled={
                    !config.villages.some(
                      (v) =>
                        v.active &&
                        can(user, "create", v.id) &&
                        can(user, "view", v.id),
                    )
                  }
                  onClick={() => {
                    setEditor({
                      ...initial(),
                      village: config.villages.find(
                        (v) =>
                          v.active &&
                          can(user, "create", v.id) &&
                          can(user, "view", v.id),
                      )?.id,
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
            setFilters({
              q,
              village,
              status,
              cat,
              ageGroup,
              disability,
              requestType,
              requestFrom,
              requestTo,
            });
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
            onChange={(e) => {
              setCat(e.target.value);
              setRequestType("");
            }}
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
          <details className="advanced-filters">
            <summary>ตัวกรองเพิ่มเติม</summary>
            <Select
              label="ช่วงวัย"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
            >
              {[
                ["", "ทุกช่วงวัย"],
                ["child", "เด็ก · 0–17 ปี"],
                ["youth", "เยาวชน · 18–25 ปี"],
                ["adult", "วัยทำงาน · 26–59 ปี"],
                ["senior", "ผู้สูงอายุ · 60 ปีขึ้นไป"],
                ["unknown", "ไม่ระบุวันเกิด"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Select
              label="ประเภทความพิการ"
              value={disability}
              onChange={(e) => setDisability(e.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="none">ไม่มีความพิการ</option>
              {disabilities.map((d, i) => (
                <option key={d} value={String(i)}>
                  {d}
                </option>
              ))}
            </Select>
            <Field label="ประเภทความช่วยเหลือย่อย">
              <input
                list="filter-request-types"
                value={requestType}
                maxLength={300}
                onChange={(e) => setRequestType(e.target.value)}
                placeholder="เลือกหรือพิมพ์ชื่อประเภทเดิม"
              />
              <datalist id="filter-request-types">
                {[
                  ...new Set(
                    config.types
                      .filter((t) => !cat || t.id === cat)
                      .flatMap((t) => t.items),
                  ),
                ].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field
              label="ยื่นคำขอตั้งแต่วันที่"
              type="date"
              value={requestFrom}
              max={requestTo || undefined}
              onChange={(e) => setRequestFrom(e.target.value)}
            />
            <Field
              label="ยื่นคำขอถึงวันที่"
              type="date"
              value={requestTo}
              min={requestFrom || undefined}
              onChange={(e) => setRequestTo(e.target.value)}
            />
            <p className="small muted">
              หมวดหมู่ ประเภทย่อย และวันที่ต้องตรงกับคำขอเดียวกัน
            </p>
          </details>
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
              {Object.values(filters).some(Boolean) && (
                <> · {Object.values(filters).filter(Boolean).length} ตัวกรอง</>
              )}
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
                      <span className={"badge " + p.status}>
                        {personLabels[p.status]}
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
                        อายุ {p.age ?? "ไม่ระบุ"} ปี
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
                          const s = p.categoryStatuses[i];
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
                          <>
                            <button
                              className="icon"
                              aria-label={"ดูทะเบียนในถังขยะ " + p.first}
                              onClick={() =>
                                setSelection({ id: p.id, mode: "archive" })
                              }
                            >
                              <Eye size={17} />
                            </button>
                            <button
                              title="กู้คืน"
                              onClick={() => {
                                setActionError("");
                                setRestoring(p);
                              }}
                            >
                              <RotateCcw size={17} />
                              กู้คืน
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="icon"
                              aria-label={`ดู ${p.first}`}
                              onClick={() => {
                                setSelection({ id: p.id, mode: "view" });
                              }}
                            >
                              <Eye size={17} />
                            </button>
                            {can(user, "edit", p.village) && (
                              <button
                                className="icon"
                                aria-label={`แก้ไข ${p.first}`}
                                onClick={() => {
                                  setSelection({ id: p.id, mode: "edit" });
                                }}
                              >
                                <Pencil size={17} />
                              </button>
                            )}
                            {can(user, "delete", p.village) && (
                              <button
                                className="icon danger"
                                aria-label={`ลบ ${p.first}`}
                                onClick={() => {
                                  setActionError("");
                                  setDeleting(p);
                                }}
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
      {selection && (
        <RecordDialog
          selection={selection}
          config={config}
          user={user}
          onClose={() => setSelection(null)}
          onEdit={() => setSelection({ ...selection, mode: "edit" })}
          onRestore={(p) => {
            setActionError("");
            setSelection(null);
            setRestoring(p);
          }}
          onSaved={() => {
            setSelection(null);
            load();
            refresh();
          }}
        />
      )}
      {restoring && (
        <Modal
          title="ยืนยันกู้คืนทะเบียน"
          closeDisabled={busy}
          onClose={() => !busy && setRestoring(null)}
        >
          <ErrorBox error={actionError} />
          <p>
            กู้คืนทะเบียนของ {restoring.title}
            {restoring.first} {restoring.last}{" "}
            พร้อมคำขอและประวัติการช่วยเหลือกลับสู่รายการปกติ
          </p>
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setRestoring(null)}>
              ยกเลิก
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setActionError("");
                try {
                  await api("/people/" + restoring.id + "/restore", "POST", {
                    version: restoring.version,
                  });
                  setRestoring(null);
                  load();
                  refresh();
                } catch (e) {
                  setActionError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "กำลังกู้คืน…" : "ยืนยันกู้คืน"}
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="ย้ายข้อมูลเข้าถังขยะ"
          closeDisabled={busy}
          onClose={() => !busy && setDeleting(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setBusy(true);
                await api("/people/" + deleting.id, "DELETE", {
                  ...Object.fromEntries(new FormData(e.target)),
                  version: deleting.version,
                });
                setDeleting(null);
                load();
                refresh();
              } catch (e) {
                setActionError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ErrorBox error={actionError} />
            <p>
              {deleting.first} {deleting.last}{" "}
              พร้อมคำขอและประวัติการช่วยเหลือจะถูกซ่อน ผู้ดูแลกู้คืนได้
            </p>
            <Field
              label="เหตุผลการลบ"
              name="reason"
              disabled={busy}
              required
              maxLength={1000}
            />
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
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
function PersonEditor({ person, config, user, onClose, onSaved }) {
  const [p, setP] = useState(() => structuredClone(person)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [duplicates, setDuplicates] = useState(null),
    [existingId, setExistingId] = useState(null);
  const original = useRef(JSON.stringify(person));
  const errorRef = useRef(null);
  const dirty = JSON.stringify(p) !== original.current;
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);
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
    if (confirm.kind === "request")
      update(
        "requests",
        p.requests.filter((r) => r.id !== confirm.id),
      );
    if (confirm.kind === "payment")
      update(
        "requests",
        p.requests.map((r) =>
          r.id === confirm.request
            ? { ...r, payments: r.payments.filter((x) => x.id !== confirm.id) }
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
  async function persist() {
    setBusy(true);
    setError("");
    try {
      await api(p.id ? "/people/" + p.id : "/people", p.id ? "PUT" : "POST", p);
      onSaved();
    } catch (e) {
      setError(e.message);
      setDuplicates(null);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setError("");
    const err = validatePerson(p, config);
    if (err) {
      setError(err);
      return;
    }
    const fields = ["first", "last", "birth", "phone", "nationalId"];
    if (
      !p.id ||
      fields.some((key) => (p[key] || "").trim() !== (person[key] || "").trim())
    ) {
      setBusy(true);
      try {
        const result = await api(
          "/people/duplicate-check",
          "POST",
          Object.fromEntries(
            [...fields, "id"]
              .filter((key) => p[key] !== undefined)
              .map((key) => [key, p[key] ?? ""]),
          ),
        );
        if (result.total) {
          setDuplicates(result);
          setBusy(false);
          return;
        }
      } catch (e) {
        setError(e.message);
        setBusy(false);
        return;
      }
    }
    await persist();
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
          p.id ? "แก้ไขทะเบียนผู้ประสบปัญหา" : "เพิ่มผู้ประสบปัญหาทางสังคม"
        }
        onClose={requestClose}
        closeDisabled={busy}
        wide
      >
        <form onSubmit={save}>
          <div ref={errorRef} tabIndex={-1}>
            <ErrorBox error={error} />
          </div>
          <fieldset disabled={busy}>
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
                      (p.id && v.id === p.village) ||
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
              {
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
              }
            </div>
            {!p.requests.length && (
              <p className="muted">ยังไม่มีคำขอรับความช่วยเหลือ</p>
            )}
            {!!p.requests.length && (
              <div className="request-overview" aria-label="สรุปคำขอ">
                {p.requests.map((r, i) => (
                  <article key={r.id}>
                    <span className={"badge " + r.status}>
                      {statuses[r.status]}
                    </span>
                    <h4>{categories[Number(r.category)]}</h4>
                    <p>{r.type || "ยังไม่ระบุประเภท"}</p>
                    <small>ช่วยเหลือ {r.payments.length} ครั้ง</small>
                    <strong className="request-money">
                      {sumMoney(r.payments) === null
                        ? "ตรวจสอบจำนวนเงิน"
                        : formatMoney(sumMoney(r.payments)) + " บาท"}
                    </strong>
                    <button
                      type="button"
                      onClick={() => {
                        const heading = document.getElementById(
                          "request-" + r.id,
                        );
                        heading?.focus();
                        heading?.scrollIntoView({ block: "start" });
                      }}
                    >
                      ไปที่คำขอที่ {i + 1}
                    </button>
                  </article>
                ))}
              </div>
            )}
            {p.requests.map((r, index) => (
              <section className="request-card" key={r.id}>
                <div className="panel-title">
                  <h3 id={"request-" + r.id} tabIndex={-1}>
                    คำขอที่ {index + 1} · {categories[Number(r.category)]}
                  </h3>
                  <div className="actions">
                    <span className={"badge " + r.status}>
                      {statuses[r.status]}
                    </span>
                    {!savedRequests.has(r.id) && (
                      <button
                        type="button"
                        className="danger"
                        aria-label={`ลบคำขอที่ ${index + 1} ที่ยังไม่บันทึก`}
                        onClick={() =>
                          setConfirm({ kind: "request", id: r.id })
                        }
                      >
                        <Trash2 size={15} />
                        ลบรายการใหม่
                      </button>
                    )}
                  </div>
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
                        <strong>ครั้งที่ {i + 1}</strong>
                        {!savedPayments.has(x.id) && (
                          <button
                            type="button"
                            className="danger"
                            aria-label={`ลบการช่วยเหลือครั้งที่ ${i + 1} ในคำขอที่ ${index + 1} ที่ยังไม่บันทึก`}
                            onClick={() =>
                              setConfirm({
                                kind: "payment",
                                id: x.id,
                                request: r.id,
                              })
                            }
                          >
                            <Trash2 size={15} />
                            ลบรายการใหม่
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
                  {
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
                  }
                </details>
              </section>
            ))}
          </fieldset>
          <div className="modal-actions">
            <button type="button" disabled={busy} onClick={requestClose}>
              ยกเลิก
            </button>
            {
              <button className="primary" disabled={busy}>
                {busy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
              </button>
            }
          </div>
        </form>
      </Modal>
      {duplicates && (
        <Modal
          title="พบทะเบียนที่อาจซ้ำ"
          closeDisabled={busy}
          onClose={() => !busy && setDuplicates(null)}
        >
          <p className="notice">
            พบข้อมูลตรงกันในทะเบียนที่คุณมีสิทธิ์ดู กรุณาตรวจสอบก่อนบันทึก
          </p>
          <div className="duplicate-list">
            {duplicates.items.map((item) => (
              <article key={item.id}>
                <strong>
                  {item.title}
                  {item.first} {item.last}
                </strong>
                <p>
                  หมู่ {item.village} ·{" "}
                  {item.matchReason === "nationalId"
                    ? "เลขบัตรประชาชนตรงกัน"
                    : item.matchReason === "birth"
                      ? "ชื่อและวันเกิดตรงกัน"
                      : "ชื่อและเบอร์โทรตรงกัน"}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDuplicates(null);
                    setExistingId(item.id);
                  }}
                >
                  ดูทะเบียนเดิม
                </button>
              </article>
            ))}
          </div>
          {duplicates.total > duplicates.items.length && (
            <p className="small muted">
              พบทั้งหมด {duplicates.total} รายการ แสดง 5 รายการแรก
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDuplicates(null)}
            >
              กลับไปตรวจสอบ
            </button>
            {!duplicates.items.some(
              (item) => item.matchReason === "nationalId",
            ) && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={persist}
              >
                {busy ? "กำลังบันทึก…" : "ยืนยันว่าเป็นคนละบุคคลและบันทึก"}
              </button>
            )}
          </div>
        </Modal>
      )}
      {existingId && (
        <RecordDialog
          selection={{ id: existingId, mode: "view" }}
          config={config}
          user={user}
          onClose={() => setExistingId(null)}
        />
      )}
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
              : "รายการนี้ยังไม่ถูกบันทึกในระบบ ต้องการลบออกจากแบบฟอร์มหรือไม่?"
          }
          confirmText={
            confirm.kind === "close" ? "ละทิ้งการเปลี่ยนแปลง" : "ลบรายการใหม่"
          }
          onCancel={() => setConfirm(null)}
          onConfirm={discard}
        />
      )}
    </>
  );
}

function RecordDialog({
  selection,
  config,
  user,
  onClose,
  onSaved,
  onEdit,
  onRestore,
}) {
  const [result, setResult] = useState(null),
    [error, setError] = useState("");
  const key = selection.id + ":" + selection.mode;
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    api(
      "/people/" +
        selection.id +
        (selection.mode === "archive" ? "?trash=1" : ""),
      "GET",
      undefined,
      {
        signal: controller.signal,
      },
    )
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [key]);
  if (error)
    return (
      <Modal title="ไม่สามารถเปิดทะเบียน" onClose={onClose}>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button onClick={onClose}>ปิด</button>
        </div>
      </Modal>
    );
  if (!result || result.key !== key)
    return (
      <Modal title="กำลังโหลดทะเบียน" onClose={onClose}>
        <p role="status">กำลังตรวจสอบสิทธิ์และโหลดข้อมูลล่าสุด…</p>
      </Modal>
    );
  return selection.mode === "edit" ? (
    <PersonEditor
      person={result.data}
      config={config}
      user={user}
      onClose={onClose}
      onSaved={onSaved}
    />
  ) : (
    <PersonDetails
      person={result.data}
      config={config}
      onClose={onClose}
      onEdit={
        !result.data.deletedAt && can(user, "edit", result.data.village)
          ? onEdit
          : undefined
      }
      onRestore={
        result.data.deletedAt && onRestore
          ? () => onRestore(result.data)
          : undefined
      }
    />
  );
}
