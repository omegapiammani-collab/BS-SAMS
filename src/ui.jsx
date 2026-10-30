import React from "react";
import { X, Inbox } from "lucide-react";
export function Field({ label, children, ...props }) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ? (
        React.Children.map(children, (c) =>
          React.isValidElement(c) &&
          ["input", "select", "textarea"].includes(c.type)
            ? React.cloneElement(c, { id })
            : c,
        )
      ) : (
        <input id={id} {...props} />
      )}
    </div>
  );
}
export const Select = ({ label, children, ...props }) => (
  <Field label={label}>
    <select {...props}>{children}</select>
  </Field>
);
export const Empty = ({ text = "ยังไม่มีข้อมูล", children }) => (
  <div className="empty">
    <Inbox size={38} />
    <h3>{text}</h3>
    {children}
  </div>
);
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  closeDisabled = false,
}) {
  const ref = React.useRef();
  const titleId = React.useId();
  React.useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={wide ? "wide" : ""}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon"
          aria-label="ปิด"
          disabled={closeDisabled}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export const ErrorBox = ({ error }) =>
  error ? (
    <div role="alert" className="error">
      {error}
    </div>
  ) : null;

export function ConfirmDialog({
  title,
  description,
  confirmText,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{description}</p>
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          กลับไปแก้ไข
        </button>
        <button type="button" className="danger-button" onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
