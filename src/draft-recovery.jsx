import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Modal, ErrorBox } from "./ui.jsx";
const date = (ms) =>
  new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(ms));
export function DraftRecovery({ onResume, reload }) {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(null),
    [deleting, setDeleting] = useState(null),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setItems((await api("/drafts")).items);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [reload]);
  async function resume(id) {
    setBusy(true);
    try {
      const draft = await api("/drafts/" + id);
      if (draft.conflict) setConflict(draft);
      else onResume(draft);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ErrorBox error={error} />
      {!!items.length && (
        <section className="panel draft-list">
          <h2>ร่างที่ยังไม่บันทึก</h2>
          <p className="muted">
            ร่างส่วนตัวของบัญชีนี้ เก็บ 7 วันนับจากการเก็บร่างล่าสุด
            กู้คืนแล้วต้องกดบันทึกข้อมูลเพื่อให้เข้าเป็นทะเบียนจริง
          </p>
          {items.map((item) => (
            <div className="draft-row" key={item.id}>
              <div>
                <strong>
                  {item.first} {item.last}
                </strong>
                <span className="block small muted">
                  {item.personId ? "แก้ไขทะเบียนเดิม" : "เพิ่มบุคคลใหม่"} ·
                  เก็บล่าสุด {date(item.updatedAt)}
                </span>
              </div>
              <div className="actions">
                <button disabled={busy} onClick={() => resume(item.id)}>
                  กู้คืนร่าง
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => setDeleting(item)}
                >
                  ลบร่าง
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {deleting && (
        <Modal
          title="ลบร่างที่ยังไม่บันทึก"
          closeDisabled={busy}
          onClose={() => !busy && setDeleting(null)}
        >
          <p>
            ลบร่างของ {deleting.first} {deleting.last} ออกจากบัญชีนี้
            โดยไม่ลบทะเบียนจริง การลบร่างไม่สามารถกู้คืนผ่านหน้าจอนี้ได้
          </p>
          <ErrorBox error={error} />
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setDeleting(null)}>
              ยกเลิก
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/drafts/" + deleting.id, "DELETE", {
                    version: deleting.version,
                  });
                  setDeleting(null);
                  await load();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              ยืนยันลบร่าง
            </button>
          </div>
        </Modal>
      )}
      {conflict && (
        <Modal
          title="ทะเบียนเปลี่ยนหลังเก็บร่าง"
          onClose={() => setConflict(null)}
        >
          <p>
            ร่างนี้อ้างอิงทะเบียนรุ่นเก่า จึงไม่เปิดให้บันทึกทับข้อมูลล่าสุด
            ร่างยังถูกเก็บไว้
            คุณสามารถดูข้อความร่างเพื่อเทียบกับทะเบียนปัจจุบันก่อนแก้ไขใหม่
          </p>
          <p>
            <strong>
              {conflict.data.first} {conflict.data.last}
            </strong>{" "}
            · หมู่ {conflict.data.village} · {conflict.data.requests.length}{" "}
            คำขอในร่าง
          </p>
          <div className="modal-actions">
            <button onClick={() => setConflict(null)}>ปิด</button>
            <button
              className="primary"
              onClick={() => {
                onResume({ ...conflict, readonly: true });
                setConflict(null);
              }}
            >
              ดูร่างแบบอ่านอย่างเดียว
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
