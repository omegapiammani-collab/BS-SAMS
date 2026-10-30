import React, { useState } from "react";
import { Modal, Field, ErrorBox } from "./ui";
import { api } from "./api";

export function PasswordDialog({ onClose, onSaved }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    if (values.password !== values.confirm) {
      setError("รหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }
    setBusy(true);
    try {
      await api("/password", "POST", {
        current: values.current,
        password: values.password,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="เปลี่ยนรหัสผ่าน" onClose={() => !busy && onClose()}>
      <p className="notice">
        เมื่อเปลี่ยนรหัสผ่านสำเร็จ ระบบจะออกจากระบบทุกอุปกรณ์
        กรุณาเข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่
      </p>
      <form onSubmit={save}>
        <ErrorBox error={error} />
        <fieldset disabled={busy}>
          <Field
            label="รหัสผ่านปัจจุบัน"
            name="current"
            type="password"
            required
            maxLength={128}
            autoComplete="current-password"
          />
          <Field
            label="รหัสผ่านใหม่ อย่างน้อย 8 ตัวอักษร · A–Z, a–z, 0–9 และอักขระพิเศษ"
            name="password"
            type="password"
            minLength={8}
            maxLength={128}
            required
            autoComplete="new-password"
          />
          <Field
            label="ยืนยันรหัสผ่านใหม่"
            name="confirm"
            type="password"
            minLength={8}
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
            {busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
