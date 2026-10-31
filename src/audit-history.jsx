import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { api } from "./api";
import { auditActions, auditTarget } from "./audit-actions";
import { TableScroll, Field, Select, Empty, ErrorBox } from "./ui";
export function AuditHistory() {
  const [draft, setDraft] = useState({
      from: "",
      to: "",
      action: "",
      actor: "",
      target: "",
    }),
    [filters, setFilters] = useState({}),
    [page, setPage] = useState(1),
    [size, setSize] = useState(25),
    [result, setResult] = useState({ items: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const query = new URLSearchParams({
    ...filters,
    page: String(page),
    size: String(size),
  }).toString();
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    setResult({ items: [], total: 0 });
    api("/audit?" + query, "GET", undefined, { signal: ctrl.signal })
      .then((r) => {
        if (!ctrl.signal.aborted) setResult(r);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [query]);
  const update = (key, value) => setDraft({ ...draft, [key]: value });
  const pages = Math.max(1, Math.ceil(result.total / size));
  return (
    <section className="panel audit-history">
      <h2>ประวัติการใช้งาน</h2>
      <p className="notice">
        แสดงเฉพาะการทำรายการที่สำเร็จ เวลาแสดงตามประเทศไทย
        ข้อมูลรหัสผ่านและรายละเอียดส่วนบุคคลไม่ถูกเก็บในประวัตินี้
      </p>
      <form
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...draft });
          setPage(1);
        }}
      >
        <div className="audit-filters">
          <Field
            label="ตั้งแต่วันที่"
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => update("from", e.target.value)}
          />
          <Field
            label="ถึงวันที่"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => update("to", e.target.value)}
          />
          <Select
            label="การดำเนินการ"
            value={draft.action}
            onChange={(e) => update("action", e.target.value)}
          >
            <option value="">ทุกการดำเนินการ</option>
            {Object.entries(auditActions).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Field
            label="ผู้ทำรายการ · ชื่อบัญชีหรือรหัสผู้ใช้"
            value={draft.actor}
            maxLength={100}
            onChange={(e) => update("actor", e.target.value)}
          />
          <Field
            label="รหัสรายการที่เกี่ยวข้อง"
            value={draft.target}
            maxLength={200}
            onChange={(e) => update("target", e.target.value)}
          />
        </div>
        <div className="actions">
          <button className="primary">
            <Search size={16} />
            ค้นหาประวัติ
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft({ from: "", to: "", action: "", actor: "", target: "" });
              setFilters({});
              setPage(1);
            }}
          >
            ล้างตัวกรอง
          </button>
        </div>
      </form>
      <ErrorBox error={error} />
      <TableScroll aria-label="ตารางประวัติการทำรายการ">
        <table>
          <thead>
            <tr>
              <th>วันเวลา · ประเทศไทย</th>
              <th>ผู้ทำรายการ</th>
              <th>การดำเนินการ</th>
              <th>รายการที่เกี่ยวข้อง</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((a) => (
              <tr key={a.id}>
                <td>
                  {new Date(a.created_at + "Z").toLocaleString("th-TH", {
                    timeZone: "Asia/Bangkok",
                  })}
                </td>
                <td>
                  <strong>
                    {a.actor_username || a.current_username || a.actor}
                  </strong>
                  {!a.actor_username && (
                    <small className="block muted">
                      {a.current_username
                        ? "ข้อมูลเก่า · ชื่อบัญชีปัจจุบัน"
                        : "ข้อมูลเก่า · แสดงรหัสผู้ใช้"}
                    </small>
                  )}
                </td>
                <td>{auditActions[a.action] || "การดำเนินการอื่น"}</td>
                <td>
                  <span className="audit-target">{auditTarget(a.target)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {loading ? (
        <p className="loading" role="status">
          กำลังโหลดประวัติ…
        </p>
      ) : (
        !error &&
        !result.items.length && <Empty text="ไม่พบประวัติตามเงื่อนไข" />
      )}
      <div className="pagination">
        <span>ทั้งหมด {result.total} รายการ</span>
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
          disabled={loading || page === 1}
          aria-label="ประวัติหน้าก่อน"
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          disabled={loading || page >= pages}
          aria-label="ประวัติหน้าถัดไป"
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </section>
  );
}
