import React, { useEffect, useState } from "react";
import {
  Users,
  HeartHandshake,
  CheckCheck,
  Wallet,
  Download,
  ArrowUpRight,
} from "lucide-react";
import { api } from "./api";
import {
  categories,
  villageNames,
  summarize,
  personLabels,
  personStatus,
} from "./domain";
import { Field, ErrorBox, Empty } from "./ui";
const n = (x) => Number(x || 0).toLocaleString("th-TH");
function useSummary(range, refresh) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/summary?from=${range[0]}&to=${range[1]}`)
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
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
          [Users, "ผู้ประสบปัญหาทั้งหมด", d.people, "คน", "blue"],
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
              {n(value)} <small>{unit}</small>
            </strong>
            <span className="metric-foot">ข้อมูลในช่วงปีงบประมาณที่เลือก</span>
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
                      background: [
                        "#004eaf",
                        "#ffa500",
                        "#057855",
                        "#5c82bf",
                        "#78b6ae",
                        "#939bc5",
                        "#a2acbb",
                      ][i],
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
            <h2>ความคืบหน้าการช่วยเหลือ</h2>
            <span className="small muted">รายบุคคล</span>
          </div>
          <div className="donut-layout">
            <div
              className="donut"
              style={{
                background: d.people
                  ? `conic-gradient(#057855 0 ${(d.done / d.people) * 100}%,#ffa500 ${(d.done / d.people) * 100}% ${((d.done + d.partial) / d.people) * 100}%,#dce5ef ${((d.done + d.partial) / d.people) * 100}% 100%)`
                  : "#e9eef4",
              }}
            >
              <div>
                <strong>{n(d.people)}</strong>
                <span>ผู้ประสบปัญหา</span>
              </div>
            </div>
            <div className="legend">
              {[
                ["#057855", "ช่วยเหลือครบแล้ว", d.done],
                ["#ffa500", "ช่วยเหลือบางส่วน", d.partial],
                [
                  "#dce5ef",
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
          <p className="panel-note">คำนวณอายุ ณ วันสิ้นสุดช่วงรายงาน</p>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>คำขอและการช่วยเหลือรายเดือน</h2>
          </div>
          <div className="monthly">
            {d.monthly.map((m, i) => (
              <div key={i}>
                <div className="columns">
                  <i
                    style={{
                      height: Math.max(
                        2,
                        (m.requested /
                          Math.max(
                            ...d.monthly.map((x) =>
                              Math.max(x.requested, x.helped),
                            ),
                            1,
                          )) *
                          130,
                      ),
                    }}
                    title={`คำขอ ${m.requested}`}
                  />
                  <i
                    style={{
                      height: Math.max(
                        2,
                        (m.helped /
                          Math.max(
                            ...d.monthly.map((x) =>
                              Math.max(x.requested, x.helped),
                            ),
                            1,
                          )) *
                          130,
                      ),
                    }}
                    title={`การช่วยเหลือ ${m.helped}`}
                  />
                </div>
                <span>
                  {
                    [
                      "ต.ค.",
                      "พ.ย.",
                      "ธ.ค.",
                      "ม.ค.",
                      "ก.พ.",
                      "มี.ค.",
                      "เม.ย.",
                      "พ.ค.",
                      "มิ.ย.",
                      "ก.ค.",
                      "ส.ค.",
                      "ก.ย.",
                    ][i]
                  }
                </span>
              </div>
            ))}
          </div>
          <div className="inline-legend">
            <span>
              <i />
              จำนวนคำขอ
            </span>
            <span>
              <i />
              จำนวนครั้งที่ช่วยเหลือ
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
export async function downloadRows(rows, format, name) {
  const content = rows.map((r) => r.map(safeCell));
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
  a.download = `${name}.${format === "csv" ? "csv" : "xlsx"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Reports({ user, config, range, setRange }) {
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
  async function exportData(format) {
    setBusy(true);
    setError("");
    try {
      const people = await api("/export", "POST", {});
      const sum = summarize(people, ...range);
      const rows =
        type === "category"
          ? categories.map((c, i) => [c, sum.category[i]])
          : config.villages.map((v) => [
              `หมู่ ${v.id} บ้าน${v.name}`,
              sum.villages[v.id] || 0,
            ]);
      await downloadRows(
        [["ช่วงวันที่", ...range], ["หมวดหมู่", "จำนวนคน"], ...rows],
        format,
        "รายงานผู้ประสบปัญหา",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="report-controls">
          <Field label="ตั้งแต่วันที่">
            <input
              type="date"
              value={range[0]}
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
        </div>
        <div className="notice">
          ยอดบนหน้าจอแสดงครบทั้งตำบล
          ส่วนไฟล์ส่งออกมีเฉพาะหมู่บ้านที่คุณมีสิทธิ์ดูและส่งออก
        </div>
      </section>
      <ErrorBox error={error || exportError} />
      <section className="panel">
        <div className="panel-title">
          <h2>
            จำนวนผู้ประสบปัญหา
            {type === "category" ? "ตามประเภทความช่วยเหลือ" : "รายหมู่บ้าน"}
          </h2>
          <div className="actions">
            {["csv", "xlsx"].map((f) => (
              <button
                key={f}
                disabled={
                  busy ||
                  (user.role !== "admin" &&
                    !user.permissions.includes("export"))
                }
                onClick={() => exportData(f)}
              >
                <Download size={16} />
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>หมวดหมู่</th>
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
        </div>
      </section>
    </>
  );
}
