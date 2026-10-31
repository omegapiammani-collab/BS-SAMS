import { categoryColors } from "./category-colors.js";
import { reportExport } from "./report-export.js";
import React, { useEffect, useRef, useState } from "react";
import {
  Users,
  HeartHandshake,
  CheckCheck,
  Wallet,
  Download,
  ArrowUpRight,
} from "lucide-react";
import { api } from "./api";
import { formatMoney } from "./money";
import { categories, monthLabel, validateReportRange } from "./domain";
import { TableScroll, Field, ErrorBox, Empty } from "./ui";
const n = (x) => Number(x || 0).toLocaleString("th-TH");
function useSummary(range, refresh) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setData(null);
    setError("");
    const rangeError = validateReportRange(...range);
    if (rangeError) {
      setError(rangeError);
      return;
    }
    api(`/summary?from=${range[0]}&to=${range[1]}`, "GET", undefined, {
      signal: controller.signal,
    })
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => active && e.name !== "AbortError" && setError(e.message));
    return () => {
      active = false;
      controller.abort();
    };
  }, [range[0], range[1], refresh]);
  return [data, error];
}
export function Dashboard({ config, range, refresh, onRegistry }) {
  const [d, error] = useSummary(range, refresh);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <p>กำลังโหลดภาพรวม…</p>;
  const max = Math.max(...Object.values(d.villages), 1);
  return (
    <>
      <div className="metrics">
        {[
          [Users, "ผู้ยื่นคำขอในช่วงวันที่", d.people, "คน", "blue"],
          [
            HeartHandshake,
            "คำขอรับความช่วยเหลือ",
            d.requests,
            "คำขอ",
            "orange",
          ],
          [CheckCheck, "ช่วยเหลือครบแล้ว", d.done, "คน", "green"],
          [Wallet, "มูลค่าความช่วยเหลือ", d.amount, "บาท", "navy"],
        ].map(([Icon, label, value, unit, color]) => (
          <section className={"metric " + color} key={label}>
            <div className="metric-label">
              {label}
              <span className="metric-icon">
                <Icon size={21} />
              </span>
            </div>
            <strong>
              {unit === "บาท" ? formatMoney(value) : n(value)}{" "}
              <small>{unit}</small>
            </strong>
            <span className="metric-foot">ข้อมูลในช่วงวันที่ที่เลือก</span>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>ผู้ประสบปัญหาตามประเภทความช่วยเหลือ</h2>
            <span className="muted small">หน่วย: คน</span>
          </div>
          <div className="bars">
            {categories.map((c, i) => (
              <div className="bar-row" key={c}>
                <span>{c}</span>
                <div className="track">
                  <i
                    style={{
                      width: d.category[i]
                        ? `${Math.max(3, (d.category[i] / Math.max(...d.category, 1)) * 100)}%`
                        : "0%",
                      background: categoryColors[i],
                    }}
                  />
                </div>
                <strong>{n(d.category[i])}</strong>
              </div>
            ))}
          </div>
          <p className="panel-note">
            คนเดียวอาจอยู่ได้หลายประเภท จึงไม่ควรรวมเป็นจำนวนคนทั้งหมด
          </p>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>สถานะปัจจุบันของคำขอในช่วงวันที่</h2>
            <span className="small muted">รายบุคคล</span>
          </div>
          <div className="donut-layout">
            <div
              className="donut"
              style={{
                background: d.people
                  ? `conic-gradient(var(--chart-success) 0 ${(d.done / d.people) * 100}%,var(--orange) ${(d.done / d.people) * 100}% ${((d.done + d.partial) / d.people) * 100}%,var(--chart-pending) ${((d.done + d.partial) / d.people) * 100}% 100%)`
                  : "var(--chart-pending)",
              }}
            >
              <div>
                <strong>{n(d.people)}</strong>
                <span>ผู้ประสบปัญหา</span>
              </div>
            </div>
            <div className="legend">
              {[
                ["var(--chart-success)", "ช่วยเหลือครบแล้ว", d.done],
                ["var(--orange)", "ช่วยเหลือบางส่วน", d.partial],
                [
                  "var(--chart-pending)",
                  "รอดำเนินการ / ยุติคำขอ",
                  d.people - d.done - d.partial,
                ],
              ].map(([color, label, num]) => (
                <div key={label}>
                  <span>
                    <i style={{ background: color }} />
                    {label}
                  </span>
                  <strong>{n(num)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="panel village-panel">
          <div className="panel-title">
            <h2>ผู้ประสบปัญหารายหมู่บ้าน</h2>
            <span className="small muted">
              {config.villages.length} หมู่บ้าน · หน่วย: คน
            </span>
          </div>
          <div className="village-bars">
            {config.villages.map((v) => (
              <div key={v.id}>
                <span>
                  ม.{v.id} {v.name}
                </span>
                <div className="track">
                  <i
                    style={{
                      width: `${((d.villages[v.id] || 0) / max) * 100}%`,
                    }}
                  />
                </div>
                <strong>{n(d.villages[v.id])}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>ช่วงวัยของผู้ประสบปัญหา</h2>
          </div>
          <div className="age-grid">
            {[
              "เด็ก · 0–17 ปี",
              "เยาวชน · 18–25 ปี",
              "วัยทำงาน · 26–59 ปี",
              "ผู้สูงอายุ · 60 ปีขึ้นไป",
            ].map((a, i) => (
              <div key={a}>
                <span className="age-icon">
                  <Users size={20} />
                </span>
                <strong>
                  {n(d.ages[i])}
                  <small> คน</small>
                </strong>
                <span>{a}</span>
              </div>
            ))}
          </div>
          <p className="panel-note">
            คำนวณอายุ ณ วันสิ้นสุดช่วงรายงาน · ไม่ระบุวันเกิด {n(d.unknownAge)}{" "}
            คน
          </p>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>ผู้ยื่นคำขอและผู้ได้รับความช่วยเหลือรายเดือน</h2>
          </div>
          <div className="monthly">
            {d.monthly.map((m, i) => (
              <div key={i}>
                <div className="columns">
                  <i
                    style={{
                      height: Math.max(
                        2,
                        (m.requestedPeople /
                          Math.max(
                            ...d.monthly.map((x) =>
                              Math.max(x.requestedPeople, x.helpedPeople),
                            ),
                            1,
                          )) *
                          130,
                      ),
                    }}
                    title={`ผู้ยื่นคำขอ ${m.requestedPeople} คน`}
                  />
                  <i
                    style={{
                      height: Math.max(
                        2,
                        (m.helpedPeople /
                          Math.max(
                            ...d.monthly.map((x) =>
                              Math.max(x.requestedPeople, x.helpedPeople),
                            ),
                            1,
                          )) *
                          130,
                      ),
                    }}
                    title={`ผู้ได้รับความช่วยเหลือ ${m.helpedPeople} คน`}
                  />
                </div>
                <span>{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
          <div className="inline-legend">
            <span>
              <i />
              ผู้ยื่นคำขอ · คน
            </span>
            <span>
              <i />
              ผู้ได้รับความช่วยเหลือ · คน
            </span>
          </div>
        </section>
      </div>
      <section className="registry-callout">
        <div>
          <h3>ทะเบียนผู้ประสบปัญหาทางสังคม</h3>
          <p>เพิ่มข้อมูลบุคคล บันทึกคำขอ และประวัติการช่วยเหลือ</p>
        </div>
        <button className="primary" onClick={onRegistry}>
          เปิดทะเบียน <ArrowUpRight size={17} />
        </button>
      </section>
    </>
  );
}
function safeCell(v) {
  const s = String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
export async function downloadRows(rows, format, name, pdfOptions) {
  const content = rows.map((r) =>
    r.map((v) =>
      format !== "csv" && typeof v === "number" && Number.isFinite(v)
        ? v
        : safeCell(v),
    ),
  );
  let blob;
  if (format === "csv") {
    blob = new Blob(
      [
        "\ufeff" +
          content
            .map((r) =>
              r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","),
            )
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
  } else if (format === "pdf") {
    const { pdfBlob } = await import("./pdf-export.js");
    blob = await pdfBlob(rows, name, pdfOptions);
  } else {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("รายงาน");
    sheet.addRows(content);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((c) => (c.width = 30));
    blob = new Blob([await workbook.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Reports({ user, config, range, setRange }) {
  const controls = useRef(null);
  const [d, error] = useSummary(range),
    [type, setType] = useState("category"),
    [exportError, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = d
    ? type === "category"
      ? categories.map((c, i) => [c, d.category[i]])
      : config.villages.map((v) => [
          `หมู่ ${v.id} บ้าน${v.name}`,
          d.villages[v.id] || 0,
        ])
    : [];
  async function exportData(format, section) {
    if (!controls.current.reportValidity()) {
      setError("กรุณาตรวจสอบช่วงวันที่ก่อนส่งออกรายงาน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const sum = await api("/report-export", "POST", {
        from: range[0],
        to: range[1],
      });
      const output = reportExport(sum, config, range, type, section);
      await downloadRows(output.rows, format, output.name);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const exportButtons = (section) => (
    <div
      className="actions"
      role="group"
      aria-label={
        section === "monthly" ? "ส่งออกรายละเอียดรายเดือน" : "ส่งออกตารางสรุป"
      }
    >
      {["csv", "xlsx", "pdf"].map((format) => (
        <button
          key={format}
          disabled={
            busy ||
            !d ||
            !!error ||
            (user.role !== "admin" &&
              (!user.permissions.includes("export") ||
                !user.permissions.includes("view")))
          }
          onClick={() => exportData(format, section)}
        >
          <Download size={16} />
          {format === "xlsx" ? "EXCEL" : format.toUpperCase()}
        </button>
      ))}
    </div>
  );
  return (
    <>
      <section className="panel">
        <form
          autoComplete="on"
          ref={controls}
          className="report-controls"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field label="ตั้งแต่วันที่">
            <input
              type="date"
              value={range[0]}
              required
              max={range[1]}
              onChange={(e) =>
                e.target.value && setRange([e.target.value, range[1]])
              }
            />
          </Field>
          <Field label="ถึงวันที่">
            <input
              type="date"
              value={range[1]}
              required
              min={range[0]}
              onChange={(e) =>
                e.target.value && setRange([range[0], e.target.value])
              }
            />
          </Field>
          <Field label="รูปแบบรายงาน">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="category">ตามประเภทความช่วยเหลือ</option>
              <option value="village">รายหมู่บ้าน</option>
            </select>
          </Field>
        </form>
        <div className="notice">
          นับผู้ยื่นคำขอตามวันที่ยื่น
          และผู้ได้รับความช่วยเหลือตามวันที่ได้รับจริง
          คนเดิมได้รับหลายครั้งจะนับเป็นคนเดียวในแต่ละเดือน
          ยอดบนหน้าจอแสดงครบทั้งตำบล
          ส่วนไฟล์ส่งออกมีเฉพาะหมู่บ้านที่คุณมีสิทธิ์ดูและส่งออก
        </div>
      </section>
      <ErrorBox error={error || exportError} />
      {!d && !error && (
        <p role="status" className="loading">
          กำลังโหลดรายงาน…
        </p>
      )}
      {d && (
        <section className="metrics report-metrics">
          {[
            ["ผู้ยื่นคำขอ", d.people, "คน"],
            ["คำขอในช่วงวันที่", d.requests, "รายการ"],
            ["ผู้ได้รับความช่วยเหลือจริง", d.helpedPeople, "คน"],
            ["การช่วยเหลือจริง", d.helpedEvents, "ครั้ง"],
          ].map(([label, value, unit]) => (
            <div className="metric" key={label}>
              <span className="metric-label">{label}</span>
              <strong>
                {unit === "บาท" ? formatMoney(value) : n(value)}{" "}
                <small>{unit}</small>
              </strong>
            </div>
          ))}
        </section>
      )}
      <section className="panel">
        <div className="panel-title">
          <h2>
            จำนวนผู้ประสบปัญหา
            {type === "category" ? "ตามประเภทความช่วยเหลือ" : "รายหมู่บ้าน"}
          </h2>
          {exportButtons("summary")}
        </div>
        <TableScroll aria-label="ตารางรายงานสรุป">
          <table>
            <thead>
              <tr>
                <th>{type === "village" ? "หมู่บ้าน" : "หมวดหมู่"}</th>
                <th>จำนวนผู้ประสบปัญหา</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, count]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{n(count)} คน</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
      {d && (
        <section className="panel">
          <div className="panel-title">
            <h2>รายละเอียดรายเดือน</h2>
            {exportButtons("monthly")}
          </div>
          <p className="panel-note">
            จำนวนคนในแต่ละเดือนนับไม่ซ้ำภายในเดือน
            การรวมรายเดือนอาจมากกว่ายอดคนทั้งช่วงวันที่
            ผู้ได้รับความช่วยเหลืออาจยื่นคำขอก่อนช่วงวันที่นี้
          </p>
          <TableScroll aria-label="ตารางรายละเอียดรายเดือน">
            <table>
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th>ผู้ยื่นคำขอ · คน</th>
                  <th>คำขอ · รายการ</th>
                  <th>ผู้ได้รับความช่วยเหลือ · คน</th>
                  <th>ช่วยเหลือ · ครั้ง</th>
                  <th>จำนวนเงิน · บาท</th>
                </tr>
              </thead>
              <tbody>
                {d.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td>{n(m.requestedPeople)}</td>
                    <td>{n(m.requested)}</td>
                    <td>{n(m.helpedPeople)}</td>
                    <td>{n(m.helped)}</td>
                    <td>{formatMoney(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      )}
    </>
  );
}
