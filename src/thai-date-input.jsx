import React, { useEffect, useRef, useState } from "react";
import { formatThaiDate, parseThaiDate } from "./thai-date.js";
export function ThaiDateInput({
  value = "",
  onChange,
  min,
  max,
  name,
  id,
  ...props
}) {
  const [draft, setDraft] = useState(() => formatThaiDate(value));
  const [source, setSource] = useState(value);
  const ref = useRef(null);
  if (source !== value) {
    setSource(value);
    setDraft(formatThaiDate(value));
  }
  const parsed = parseThaiDate(draft);
  const error =
    draft && !parsed
      ? "กรอกวันที่เป็น วัน/เดือน/ปี พ.ศ. เช่น 30/10/2569"
      : parsed && min && parsed < min
        ? `วันที่ต้องไม่ก่อน ${formatThaiDate(min)}`
        : parsed && max && parsed > max
          ? `วันที่ต้องไม่หลัง ${formatThaiDate(max)}`
          : "";
  useEffect(() => {
    ref.current?.setCustomValidity(error);
  }, [error]);
  return (
    <>
      <input
        {...props}
        id={id}
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder="วว/ดด/ปปปป พ.ศ."
        value={draft}
        aria-describedby={`${id}-date-help`}
        aria-invalid={!!error}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const iso = text ? parseThaiDate(text) : "";
          if (iso !== null) {
            setSource(iso);
            onChange?.({
              target: { value: iso, name },
              currentTarget: { value: iso, name },
            });
          }
        }}
        onBlur={() => {
          if (parsed) setDraft(formatThaiDate(parsed));
        }}
      />
      <small
        id={`${id}-date-help`}
        className={error ? "date-error" : "date-help"}
      >
        {error || "วัน/เดือน/ปี พ.ศ."}
      </small>
      {name && <input type="hidden" name={name} value={value} />}
    </>
  );
}
