import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
export function AccountMenu({ user, onPassword, onLogout }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('[role="menuitem"]')?.focus();
    function outside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      className="account-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="account-trigger"
        type="button"
        aria-label={`เมนูผู้ใช้ ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="avatar" aria-hidden="true">
          {user.name[0]}
        </span>
        <span className="account-identity">
          <strong>{user.name}</strong>
          <span>{user.role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"}</span>
        </span>
        <ChevronDown
          size={16}
          className={open ? "expanded" : ""}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={id}
          ref={menu}
          role="menu"
          aria-label="เมนูบัญชีผู้ใช้"
          className="account-dropdown"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
              return;
            }
            const items = [
              ...event.currentTarget.querySelectorAll('[role="menuitem"]'),
            ];
            const index = items.indexOf(document.activeElement);
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              items[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length
              ]?.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onPassword();
            }}
          >
            <KeyRound size={18} />
            เปลี่ยนรหัสผ่าน
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onLogout();
            }}
          >
            <LogOut size={18} />
            ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  );
}
