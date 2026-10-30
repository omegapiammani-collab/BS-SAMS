import {
  NavigationGuardProvider,
  useGuardedNavigation,
} from "./navigation-guard";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  ChartNoAxesCombined,
  Settings,
  Shield,
  LogOut,
  KeyRound,
  Menu,
  HeartHandshake,
  Plus,
  ArrowRight,
  Wallet,
  House,
  Landmark,
  HandHeart,
  Banknote,
  Accessibility,
  Ellipsis,
  Search,
  ChevronRight,
} from "lucide-react";
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import { api } from "./api";
import { defaultConfig, fiscalYear, fiscalRange } from "./domain";
import { Field, ErrorBox } from "./ui";
import { Dashboard, Reports } from "./reports";
import { Registry } from "./registry";
import { UserAdmin, SystemSettings } from "./settings";
import "./style.css";
import { PasswordDialog } from "./password";
export const categoryIcons = [
  Wallet,
  House,
  Landmark,
  HandHeart,
  Banknote,
  Accessibility,
  Ellipsis,
];
const nav = [
  ["dashboard", "ภาพรวม", LayoutDashboard],
  ["registry", "ทะเบียนผู้ประสบปัญหา", Users],
  ["reports", "รายงานและส่งออก", ChartNoAxesCombined],
  ["users", "จัดการผู้ใช้งาน", Shield],
  ["settings", "ตั้งค่าระบบ", Settings],
];
function Login({ onLogin, change = false, notice = "" }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const b = Object.fromEntries(new FormData(e.target));
    try {
      if (change) {
        if (b.password !== b.confirm) throw Error("รหัสผ่านใหม่ไม่ตรงกัน");
        await api("/password", "POST", b);
        onLogin(null);
      } else onLogin(await api("/login", "POST", b));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-brand">
        <HeartHandshake size={62} />
        <h1>
          ดูแลทุกความเดือดร้อน
          <br />
          ให้เข้าถึงความช่วยเหลือ
        </h1>
        <p>
          กองสวัสดิการสังคม
          <br />
          องค์การบริหารส่วนตำบลบ้านเสด็จ
        </p>
        <div className="brand-line" />
      </section>
      <section className="login-form">
        <div className="brand">
          <HeartHandshake />
          <div>
            บ้านเสด็จ<span>ระบบสวัสดิการสังคม</span>
          </div>
        </div>
        <h2>{change ? "ตั้งรหัสผ่านใหม่" : "เข้าสู่ระบบ"}</h2>
        <p>
          {change
            ? "เปลี่ยนรหัสผ่านชั่วคราวก่อนเริ่มใช้งาน"
            : "สำหรับผู้ดูแลระบบและเจ้าหน้าที่"}
        </p>
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        <form onSubmit={submit}>
          <ErrorBox error={error} />
          {change ? (
            <>
              <Field
                label="รหัสผ่านปัจจุบัน"
                name="current"
                type="password"
                required
                autoComplete="current-password"
              />
              <Field
                label="รหัสผ่านใหม่ อย่างน้อย 12 ตัวอักษร"
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
              <Field
                label="ยืนยันรหัสผ่านใหม่"
                name="confirm"
                type="password"
                required
                autoComplete="new-password"
              />
            </>
          ) : (
            <>
              <Field
                label="ชื่อผู้ใช้"
                name="username"
                required
                autoComplete="username"
              />
              <Field
                label="รหัสผ่าน"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "กำลังดำเนินการ…"
              : change
                ? "บันทึกรหัสผ่านใหม่"
                : "เข้าสู่ระบบ"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="muted small">
          ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบเพื่อขอรหัสผ่านชั่วคราว
        </p>
      </section>
    </main>
  );
}
function App() {
  const requestNavigation = useGuardedNavigation();
  const [user, setUser] = useState(undefined),
    [config, setConfig] = useState(defaultConfig),
    [page, setPage] = useState("dashboard"),
    [menu, setMenu] = useState(false),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState(""),
    [passwordOpen, setPasswordOpen] = useState(false),
    [notice, setNotice] = useState("");
  const [year, setYear] = useState(fiscalYear()),
    [range, setRange] = useState(fiscalRange(fiscalYear()));
  useEffect(() => {
    api("/me")
      .then(setUser)
      .catch(() => setUser(null));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (user && !user.mustChange)
      api("/config")
        .then(setConfig)
        .catch((e) => setError(e.message));
  }, [user, refresh]);
  if (user === undefined) return <div className="loading">กำลังโหลดระบบ…</div>;
  if (!user || user.mustChange)
    return (
      <Login
        notice={notice}
        onLogin={(u) => {
          setUser(u);
          setPage("dashboard");
          setMenu(false);
          setPasswordOpen(false);
          if (u) setNotice("");
          else setNotice("ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
        }}
        change={!!user?.mustChange}
      />
    );
  async function logout() {
    try {
      await api("/logout", "POST", {});
      setUser(null);
      setPage("dashboard");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="app">
      {passwordOpen && (
        <PasswordDialog
          onClose={() => setPasswordOpen(false)}
          onSaved={() => {
            setPasswordOpen(false);
            setNotice("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
            setUser(null);
            setPage("dashboard");
          }}
        />
      )}
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          {config.logo ? (
            <img src={config.logo} alt="โลโก้" />
          ) : (
            <HeartHandshake size={34} />
          )}
          <div>
            บ้านเสด็จ<span>ระบบสวัสดิการสังคม</span>
          </div>
        </div>
        <p className="nav-caption">พื้นที่ทำงาน</p>
        <nav>
          {nav
            .filter(
              ([id]) =>
                user.role === "admin" || !["users", "settings"].includes(id),
            )
            .map(([id, label, Icon]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => {
                  if (id === page) {
                    setMenu(false);
                    return;
                  }
                  requestNavigation(() => {
                    setPage(id);
                    setMenu(false);
                  });
                }}
              >
                <Icon size={20} />
                {label}
                {page === id && <ChevronRight size={15} />}
              </button>
            ))}
        </nav>
        <div className="side-bottom">
          <div className="side-note">
            <Shield size={20} />
            <span>
              กองสวัสดิการสังคม
              <br />
              <small>อบต.บ้านเสด็จ จังหวัดลำปาง</small>
            </span>
          </div>
          <button
            className="account-password"
            onClick={() => {
              requestNavigation(() => {
                setPasswordOpen(true);
                setMenu(false);
              });
            }}
          >
            <KeyRound size={16} />
            เปลี่ยนรหัสผ่าน
          </button>
          <div className="profile">
            <div className="avatar">{user.name[0]}</div>
            <div>
              <strong>{user.name}</strong>
              <span>
                {user.role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"}
              </span>
            </div>
            <button
              onClick={() => requestNavigation(logout)}
              className="icon"
              title="ออกจากระบบ"
              aria-label="ออกจากระบบ"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon mobile"
            aria-label="เปิดเมนู"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span>{config.name}</span>
          <span className="top-right">องค์การบริหารส่วนตำบลบ้านเสด็จ</span>
        </header>
        <main className="content">
          <ErrorBox error={error} />
          <div className="page-head">
            <div>
              <div className="breadcrumb">
                พื้นที่ทำงาน <ChevronRight size={13} />{" "}
                {nav.find((n) => n[0] === page)?.[1]}
              </div>
              <h1>
                {page === "dashboard"
                  ? "ภาพรวมการช่วยเหลือ"
                  : nav.find((n) => n[0] === page)?.[1]}
              </h1>
              <p>
                {page === "dashboard"
                  ? "สรุปข้อมูลผู้ประสบปัญหาทางสังคม ครบทั้ง 17 หมู่บ้าน"
                  : page === "registry"
                    ? "บริหารจัดการทะเบียนและประวัติการช่วยเหลือรายบุคคล"
                    : page === "reports"
                      ? "สรุปผลตามปีงบประมาณและส่งออกข้อมูลตามสิทธิ์ของคุณ"
                      : page === "users"
                        ? "กำหนดบัญชี สิทธิ์การใช้งาน และหมู่บ้านที่เข้าถึงได้"
                        : "จัดการข้อมูลพื้นฐานและรูปแบบของระบบ"}
              </p>
            </div>
            {["dashboard", "reports"].includes(page) && (
              <label className="year">
                ปีงบประมาณ
                <select
                  value={
                    range[0] === fiscalRange(year)[0] &&
                    range[1] === fiscalRange(year)[1]
                      ? year
                      : "custom"
                  }
                  onChange={(e) => {
                    setYear(+e.target.value);
                    setRange(fiscalRange(+e.target.value));
                  }}
                >
                  <option value="custom" disabled>
                    กำหนดช่วงวันที่เอง
                  </option>
                  {Array.from(
                    { length: 7 },
                    (_, i) => fiscalYear() + 1 - i,
                  ).map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {page === "dashboard" ? (
            <Dashboard
              config={config}
              range={range}
              refresh={refresh}
              onRegistry={() => setPage("registry")}
            />
          ) : page === "registry" ? (
            <Registry
              user={user}
              config={config}
              refresh={() => setRefresh((x) => x + 1)}
            />
          ) : page === "reports" ? (
            <Reports
              user={user}
              config={config}
              range={range}
              setRange={setRange}
            />
          ) : page === "users" ? (
            <UserAdmin config={config} me={user} />
          ) : (
            <SystemSettings
              config={config}
              onSaved={(c) => {
                setConfig(c);
                setRefresh((x) => x + 1);
              }}
            />
          )}
          <footer>
            กองสวัสดิการสังคม อบต.บ้านเสด็จ{" "}
            <span>ระบบข้อมูลผู้ประสบปัญหาทางสังคม</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <NavigationGuardProvider>
    <App />
  </NavigationGuardProvider>,
);
