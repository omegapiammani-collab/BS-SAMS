import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, Select } from "./ui.jsx";
import { age, disabilities } from "./domain.js";
import { thailandDate } from "./money.js";
import { allowsChildren, childTitles, newChild } from "./children.js";

export function RequestChildren({
  request,
  readonly,
  canDelete,
  savedIds,
  onChange,
  onRemove,
  fieldProps,
}) {
  const children = request.children || [];
  if (!allowsChildren(request) && !children.length) return null;
  const change = (id, key, value) =>
    onChange(
      children.map((child) =>
        child.id === id ? { ...child, [key]: value } : child,
      ),
    );
  return (
    <section
      className="request-children"
      aria-label="บุตรหรือเด็กในความอุปการะ"
    >
      <div className="panel-title section-title">
        <h4>บุตรหรือเด็กในความอุปการะ · {children.length} คน</h4>
        {!readonly && allowsChildren(request) && children.length < 100 && (
          <button
            type="button"
            onClick={() => onChange([...children, newChild()])}
          >
            <Plus size={16} />
            เพิ่มบุตรหรือเด็กในความอุปการะ
          </button>
        )}
      </div>
      {!allowsChildren(request) && (
        <p className="muted">
          ข้อมูลเด็กที่เคยบันทึกไว้ยังคงอยู่ แม้เปลี่ยนประเภทความช่วยเหลือ
        </p>
      )}
      {!children.length && (
        <p className="muted">ยังไม่มีข้อมูลบุตรหรือเด็กในความอุปการะ</p>
      )}
      {children.map((child, index) => {
        const prefix = `requests.${request.id}.children.${child.id}`;
        return (
          <fieldset
            key={child.id}
            className="child-fields"
            aria-label={`เด็กคนที่ ${index + 1}`}
          >
            <legend>เด็กคนที่ {index + 1}</legend>
            <div className="panel-title">
              <h5>ข้อมูลส่วนบุคคล</h5>
              {!readonly && (canDelete || !savedIds.has(child.id)) && (
                <button
                  type="button"
                  className="danger"
                  aria-label={`ลบเด็กคนที่ ${index + 1}`}
                  onClick={() => onRemove(child.id)}
                >
                  <Trash2 size={15} />
                  ลบข้อมูลเด็ก
                </button>
              )}
            </div>
            <div className="form-grid">
              <Field
                label="เลขบัตรประชาชน · ไม่บังคับ"
                {...fieldProps(`${prefix}.nationalId`)}
                inputMode="numeric"
                maxLength={13}
                pattern="[0-9]{13}"
                title="กรอกตัวเลข 13 หลักตามบัตรประชาชน"
                value={child.nationalId}
                onChange={(event) =>
                  change(
                    child.id,
                    "nationalId",
                    event.target.value.replace(/[^0-9]/g, "").slice(0, 13),
                  )
                }
              />
              <Select
                label="คำนำหน้า"
                {...fieldProps(`${prefix}.title`)}
                value={child.title}
                onChange={(event) =>
                  change(child.id, "title", event.target.value)
                }
              >
                {childTitles.map((title) => (
                  <option key={title}>{title}</option>
                ))}
              </Select>
              {[
                ["ชื่อ *", "first"],
                ["นามสกุล *", "last"],
              ].map(([label, key]) => (
                <Field
                  key={key}
                  label={label}
                  {...fieldProps(`${prefix}.${key}`)}
                  required
                  maxLength={100}
                  value={child[key]}
                  onChange={(event) =>
                    change(child.id, key, event.target.value)
                  }
                />
              ))}
              <Field
                label="วันเดือนปีเกิด · พ.ศ."
                {...fieldProps(`${prefix}.birth`)}
                type="date"
                max={thailandDate()}
                value={child.birth}
                onChange={(event) =>
                  change(child.id, "birth", event.target.value)
                }
              />
              <Field
                label="อายุ"
                value={
                  age(child.birth) === null
                    ? "ไม่ระบุ"
                    : `${age(child.birth)} ปี`
                }
                readOnly
              />
            </div>
            <Field
              label="ความพิการ"
              error={fieldProps(`${prefix}.disabilities`).error}
            >
              <div
                className="checkbox-grid"
                data-field={`${prefix}.disabilities`}
                tabIndex={-1}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={!child.disabilities.length}
                    onChange={() => change(child.id, "disabilities", [])}
                  />
                  ไม่มีความพิการ
                </label>
                {disabilities.map((value) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={child.disabilities.includes(value)}
                      onChange={(event) =>
                        change(
                          child.id,
                          "disabilities",
                          event.target.checked
                            ? [...child.disabilities, value]
                            : child.disabilities.filter(
                                (item) => item !== value,
                              ),
                        )
                      }
                    />
                    {value}
                  </label>
                ))}
              </div>
            </Field>
          </fieldset>
        );
      })}
    </section>
  );
}
