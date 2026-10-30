import React from "react";
import { Pencil, Phone, MapPin, UserRound } from "lucide-react";
import { Modal } from "./ui";
import {
  age,
  categories,
  statuses,
  personStatus,
  personLabels,
  closed,
} from "./domain";
import { formatMoney, sumMoney, thailandDate } from "./money";
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Bangkok",
      }).format(new Date(value + "T00:00:00Z"))
    : "ไม่ระบุ";
function Facts({ items }) {
  return (
    <dl className="detail-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "ไม่ระบุ"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function PersonDetails({ person: p, config, onClose, onEdit }) {
  const payments = p.requests.flatMap((r) => r.payments),
    village = config.villages.find((v) => v.id === p.village);
  const total = sumMoney(payments);
  return (
    <Modal title="รายละเอียดผู้ประสบปัญหา" onClose={onClose} wide>
      <div className="person-details">
        <div className="person-identity">
          <div className="detail-avatar">
            <UserRound size={30} />
          </div>
          <div>
            <h2>
              {p.title}
              {p.first} {p.last}
            </h2>
            <span className={"badge " + personStatus(p)}>
              {personLabels[personStatus(p)]}
            </span>
            <p>
              <MapPin size={14} />
              หมู่ {p.village} บ้าน{village?.name || "ไม่ระบุ"}
              {p.phone && (
                <>
                  <Phone size={14} />
                  <a href={"tel:" + p.phone}>{p.phone}</a>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="detail-totals">
          <div>
            <span>คำขอทั้งหมด</span>
            <strong>
              {p.requests.length} <small>คำขอ</small>
            </strong>
          </div>
          <div>
            <span>ได้รับความช่วยเหลือ</span>
            <strong>
              {payments.length} <small>ครั้ง</small>
            </strong>
          </div>
          <div>
            <span>เงินช่วยเหลือรวม</span>
            <strong>
              {total === null ? (
                "ตรวจสอบจำนวนเงิน"
              ) : (
                <>
                  {formatMoney(total)} <small>บาท</small>
                </>
              )}
            </strong>
          </div>
        </div>
        <h3 className="section-title">ข้อมูลส่วนบุคคล</h3>
        <Facts
          items={[
            ["เลขบัตรประชาชน", p.nationalId || "ยังไม่ระบุเลขบัตรประชาชน"],
            ["วันเดือนปีเกิด", date(p.birth)],
            [
              "อายุ",
              p.birth ? `${age(p.birth, thailandDate())} ปี` : "ไม่ระบุ",
            ],
            ["สถานภาพ", p.marital],
            [
              "ความพิการ",
              p.disabilities.length
                ? p.disabilities.join(" · ")
                : "ไม่มีความพิการ",
            ],
            ["โทรศัพท์มือถือ", p.phone],
            ["รหัสประจำบ้าน", p.houseCode],
            ["บ้านเลขที่", p.house],
            ["หมู่บ้าน", `หมู่ ${p.village} บ้าน${village?.name || "ไม่ระบุ"}`],
            ["เลขทะเบียนระบบ", p.id],
          ]}
        />
        <h3 className="section-title">คำขอและประวัติการช่วยเหลือ</h3>
        {!p.requests.length && (
          <p className="muted">ยังไม่มีคำขอรับความช่วยเหลือ</p>
        )}
        {p.requests.map((r, i) => (
          <article className="detail-request" key={r.id}>
            <div className="panel-title">
              <div>
                <small>{categories[Number(r.category)]}</small>
                <h3>
                  คำขอที่ {i + 1} · {r.type}
                </h3>
              </div>
              <span className={"badge " + r.status}>{statuses[r.status]}</span>
            </div>
            <p className="detail-date">ยื่นคำขอ {date(r.date)}</p>
            <p className="detail-note">
              {r.note || "ไม่มีบันทึกสภาพปัญหาเพิ่มเติม"}
            </p>
            {closed.includes(r.status) && (
              <p className="notice">เหตุผลยุติคำขอ: {r.reason}</p>
            )}
            <div className="panel-title">
              <h4>ประวัติการช่วยเหลือ {r.payments.length} ครั้ง</h4>
              <strong>
                {sumMoney(r.payments) === null
                  ? "ตรวจสอบจำนวนเงิน"
                  : formatMoney(sumMoney(r.payments)) + " บาท"}
              </strong>
            </div>
            {!r.payments.length ? (
              <p className="muted small">ยังไม่มีการบันทึกความช่วยเหลือ</p>
            ) : (
              <ol className="assistance-history">
                {[...r.payments]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((payment, index) => (
                    <li key={payment.id}>
                      <div className="assistance-event">
                        <strong>
                          ครั้งที่ {index + 1} · {date(payment.date)}
                        </strong>
                        <span>{payment.provider}</span>
                        <p>{payment.detail}</p>
                        <div className="event-values">
                          {Number(payment.amount) > 0 && (
                            <strong>{formatMoney(payment.amount)} บาท</strong>
                          )}
                          {Number(payment.quantity) > 0 && (
                            <span>
                              {Number(payment.quantity).toLocaleString("th-TH")}{" "}
                              {payment.unit}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </article>
        ))}
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>ปิดรายละเอียด</button>
        {onEdit && (
          <button className="primary" onClick={onEdit}>
            <Pencil size={16} />
            แก้ไขข้อมูล
          </button>
        )}
      </div>
    </Modal>
  );
}
