import { ThaiDateInput } from "./thai-date-input.jsx";
import { passwordHelp, passwordPattern } from "./password-policy.js";
import React from "react";
import { focusAndReveal } from "./form-focus.js";
import { X, Inbox, ArrowLeftRight } from "lucide-react";
function fieldInput(props) {
  if (props.type === "date") return <ThaiDateInput {...props} />;
  // Only fields with an explicit semantic hint opt into browser autofill.
  const { autoComplete, ...inputProps } = props;
  if (props.type === "password" && autoComplete === "new-password")
    return (
      <input
        {...inputProps}
        autoComplete={autoComplete}
        minLength={8}
        maxLength={128}
        pattern={passwordPattern}
        title={passwordHelp}
      />
    );
  return <input {...inputProps} autoComplete={autoComplete || "off"} />;
}
export function Field({ label, children, error, ...props }) {
  const id = React.useId();
  const [nativeError, setNativeError] = React.useState("");
  const message = error || nativeError;
  function invalid(event) {
    event.preventDefault();
    const input = event.target;
    const validity = input.validity;
    const text = validity.valueMissing
      ? "กรุณากรอกข้อมูลช่องนี้"
      : validity.patternMismatch
        ? input.title || "รูปแบบข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"
        : validity.rangeUnderflow
          ? `ค่าต้องไม่น้อยกว่า ${input.min}`
          : validity.rangeOverflow
            ? `ค่าต้องไม่เกิน ${input.max}`
            : validity.stepMismatch
              ? "กรุณาตรวจสอบจำนวนและตำแหน่งทศนิยม"
              : input.validationMessage;
    setNativeError(text);
    if (
      input ===
      input.form?.querySelector(
        "input:invalid, select:invalid, textarea:invalid",
      )
    )
      focusAndReveal(input);
  }
  function decorate(control) {
    return {
      autoComplete: "off",
      ...control,
      id,
      onChange: (event) => {
        setNativeError("");
        control.onChange?.(event);
      },
      "aria-invalid": message ? true : undefined,
      "aria-describedby":
        [control["aria-describedby"], message ? `${id}-error` : null]
          .filter(Boolean)
          .join(" ") || undefined,
    };
  }
  return (
    <div className="field" onInvalidCapture={invalid}>
      <label htmlFor={id}>{label}</label>
      {children
        ? React.Children.map(children, (c) =>
            React.isValidElement(c) &&
            ["input", "select", "textarea"].includes(c.type)
              ? c.type === "input"
                ? fieldInput(decorate(c.props))
                : React.cloneElement(c, decorate(c.props))
              : c,
          )
        : fieldInput(decorate(props))}
      {message && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {message}
        </span>
      )}
    </div>
  );
}
export const Select = ({ label, children, error, ...props }) => (
  <Field label={label} error={error}>
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
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      title={title}
      closeDisabled={busy}
      onClose={() => !busy && onCancel()}
    >
      <p>{description}</p>
      <div className="modal-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          กลับไปแก้ไข
        </button>
        <button
          type="button"
          disabled={busy}
          className="danger-button"
          onClick={onConfirm}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}

export function TableScroll({ children, "aria-label": label }) {
  const ref = React.useRef(null);
  const hintId = React.useId();
  const [overflow, setOverflow] = React.useState(false);
  React.useEffect(() => {
    const region = ref.current;
    const observer = new ResizeObserver(() =>
      setOverflow(region.scrollWidth > region.clientWidth + 1),
    );
    observer.observe(region);
    if (region.firstElementChild) observer.observe(region.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="table-frame">
      {overflow && (
        <p className="table-scroll-hint" id={hintId}>
          <ArrowLeftRight size={16} aria-hidden="true" />
          เลื่อนซ้าย–ขวาเพื่อดูข้อมูล
        </p>
      )}
      <div
        ref={ref}
        className="table-scroll"
        role="region"
        aria-label={label}
        aria-describedby={overflow ? hintId : undefined}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
