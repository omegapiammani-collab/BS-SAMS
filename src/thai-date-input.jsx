import { DateDraftContext } from "./date-draft-context.js";
import React, { useEffect, useRef, useState, useContext } from "react";
import { CalendarDays, X, ChevronLeft, ChevronRight } from "lucide-react";
import { thailandDate } from "./money.js";
import { calendarDays, shiftMonth, thaiMonths } from "./thai-calendar.js";
import { formatThaiDate, parseThaiDate } from "./thai-date.js";
function calendarPosition(input, height = 370) {
  const box = input.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 24);
  const top =
    window.innerHeight - box.bottom >= height + 6
      ? box.bottom + 6
      : box.top - height - 6;
  return {
    left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(top, window.innerHeight - height - 12)),
    width,
  };
}
export function ThaiDateInput({
  value = "",
  onChange,
  min,
  max,
  name,
  id,
  ...props
}) {
  const draftContext = useContext(DateDraftContext);
  const fieldPath = props["data-field"];
  const [draft, setDraft] = useState(
    () => draftContext?.values[fieldPath] ?? formatThaiDate(value),
  );
  const [source, setSource] = useState(value);
  const ref = useRef(null);
  const popup = useRef(null);
  const [month, setMonth] = useState(() =>
    (value || thailandDate()).slice(0, 7),
  );
  const [picked, setPicked] = useState(value);
  const [position, setPosition] = useState({});
  const lower = min || "1800-01-01";
  const upper = max || `${Number(thailandDate().slice(0, 4)) + 100}-12-31`;
  const disabledDate = (iso) => iso < lower || iso > upper;
  function commit(iso) {
    if (fieldPath) draftContext?.set(fieldPath, undefined);
    setDraft(formatThaiDate(iso));
    setSource(iso);
    onChange?.({
      target: { value: iso, name },
      currentTarget: { value: iso, name },
    });
  }
  function closeCalendar() {
    popup.current?.hidePopover();
    ref.current?.focus();
  }
  function openCalendar() {
    if (props.disabled || ref.current?.matches(":disabled")) return;
    const initial = parseThaiDate(draft) || value || thailandDate();
    setPicked(disabledDate(initial) ? "" : initial);
    setMonth(
      (initial < lower ? lower : initial > upper ? upper : initial).slice(0, 7),
    );
    setPosition(calendarPosition(ref.current));
    popup.current.showPopover();
  }
  useEffect(() => {
    function reposition() {
      if (popup.current?.matches(":popover-open"))
        setPosition(calendarPosition(ref.current, popup.current.offsetHeight));
    }
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, []);
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
      <div className="thai-date-control">
        <button
          type="button"
          className="date-icon"
          aria-label="เปิดปฏิทิน"
          aria-controls={`${id}-calendar`}
          aria-haspopup="dialog"
          onClick={openCalendar}
          disabled={props.disabled}
        >
          <CalendarDays size={17} />
        </button>
        <input
          {...props}
          autoComplete="off"
          id={id}
          ref={ref}
          type="text"
          inputMode="numeric"
          placeholder="วว/ดด/ปปปป พ.ศ."
          value={draft}
          aria-describedby={[props["aria-describedby"], `${id}-date-help`]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={!!error || props["aria-invalid"]}
          onClick={openCalendar}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && event.altKey) {
              event.preventDefault();
              openCalendar();
            }
          }}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const iso = text ? parseThaiDate(text) : "";
            if (fieldPath)
              draftContext?.set(fieldPath, iso === null ? text : undefined);
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
        {draft && (
          <button
            type="button"
            className="date-clear"
            aria-label="ล้างวันที่"
            disabled={props.disabled}
            onClick={() => {
              commit("");
              popup.current?.hidePopover();
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div
        ref={popup}
        id={`${id}-calendar`}
        popover="auto"
        role="dialog"
        aria-label="เลือกวันที่ พ.ศ."
        className="thai-calendar"
        style={position}
      >
        <div className="calendar-toolbar">
          <button
            type="button"
            aria-label="เดือนก่อนหน้า"
            disabled={shiftMonth(month, -1) < lower.slice(0, 7)}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft size={16} />
          </button>
          <select
            aria-label="เลือกเดือน"
            value={month.slice(5, 7)}
            onChange={(e) => setMonth(month.slice(0, 5) + e.target.value)}
          >
            {thaiMonths.map((label, i) => (
              <option key={label} value={String(i + 1).padStart(2, "0")}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="เลือกปี พ.ศ."
            value={month.slice(0, 4)}
            onChange={(e) => setMonth(e.target.value + month.slice(4))}
          >
            {Array.from(
              {
                length:
                  Number(upper.slice(0, 4)) - Number(lower.slice(0, 4)) + 1,
              },
              (_, i) => Number(lower.slice(0, 4)) + i,
            ).map((year) => (
              <option key={year} value={year}>
                {year + 543}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="เดือนถัดไป"
            disabled={shiftMonth(month, 1) > upper.slice(0, 7)}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div
          className="calendar-grid"
          onKeyDown={(event) => {
            const moves = {
              ArrowLeft: -1,
              ArrowRight: 1,
              ArrowUp: -7,
              ArrowDown: 7,
            };
            if (!(event.key in moves)) return;
            event.preventDefault();
            const buttons = [...event.currentTarget.querySelectorAll("button")];
            const index = buttons.indexOf(document.activeElement);
            const next = buttons[index + moves[event.key]];
            if (next && !next.disabled) next.focus();
          }}
        >
          {calendarDays(month).map(({ iso, day, current }) => (
            <button
              type="button"
              key={iso}
              aria-label={formatThaiDate(iso)}
              aria-pressed={picked === iso}
              disabled={disabledDate(iso)}
              className={
                (current ? "" : "outside-month ") +
                (picked === iso ? "picked" : "")
              }
              onClick={() => setPicked(iso)}
            >
              {day}
            </button>
          ))}
        </div>
        <div className="calendar-footer">
          <strong>{formatThaiDate(picked) || "เลือกวันที่"}</strong>
          <button type="button" onClick={closeCalendar}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="calendar-confirm"
            disabled={!picked || disabledDate(picked)}
            onClick={() => {
              commit(picked);
              closeCalendar();
            }}
          >
            ตกลง
          </button>
        </div>
      </div>
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
