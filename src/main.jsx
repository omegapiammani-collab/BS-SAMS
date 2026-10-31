import { AccountMenu } from "./account-menu.jsx";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  ChartNoAxesCombined,
  Settings,
  Shield,
  Eye,
  EyeOff,
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
function Login({ onLogin, change = false, notice = "", username = "" }) {
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    if (!change) setLoginPassword("");
    setShowPassword(false);
  }, [change]);
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
        setLoginPassword("");
        onLogin(null);
      } else {
        const user = await api("/login", "POST", {
          ...b,
          remember: b.remember === "on",
        });
        setLoginPassword(user.mustChange ? b.password : "");
        onLogin(user);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-brand" aria-label="ข้อมูลระบบ">
        <div className="login-system-name">
          <HeartHandshake size={40} aria-hidden="true" />
          <span lang="en">Ban Sadet Social Assistance Monitoring System</span>
        </div>
        <h1>ระบบติดตามการช่วยเหลือผู้ประสบปัญหาทางสังคม</h1>
        <p className="login-organization">
          กองสวัสดิการสังคม
          <br />
          องค์การบริหารส่วนตำบลบ้านเสด็จ
        </p>
      </section>
      <section
        className="login-form"
        aria-label={change ? "ตั้งรหัสผ่านใหม่" : "เข้าสู่ระบบ"}
      >
        <div className="login-form-content">
          <h2>{change ? "ตั้งรหัสผ่านใหม่" : "เข้าสู่ระบบ"}</h2>
          <p>
            {change
              ? "เปลี่ยนรหัสผ่านชั่วคราวก่อนเริ่มใช้งาน"
              : "กรอกชื่อผู้ใช้และรหัสผ่านของท่าน"}
          </p>
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <form key={change ? "change-password" : "login"} onSubmit={submit}>
            <ErrorBox error={error} />
            {change ? (
              <>
                <input
                  type="hidden"
                  name="username"
                  autoComplete="username"
                  value={username}
                  readOnly
                />
                <Field
                  label="รหัสผ่านปัจจุบัน"
                  name="current"
                  type="password"
                  defaultValue={loginPassword}
                  readOnly={!!loginPassword}
                  required
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
                  required
                  autoComplete="new-password"
                />
              </>
            ) : (
              <>
                <Field
                  label="ชื่อผู้ใช้"
                  name="username"
                  defaultValue={username}
                  required
                  autoComplete="username"
                />
                <div className="login-password">
                  <Field label="รหัสผ่าน">
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-visibility"
                      aria-label={
                        showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </Field>
                </div>
                <label className="remember-login">
                  <input type="checkbox" name="remember" />
                  <span>จดจำการเข้าสู่ระบบ</span>
                </label>
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
        </div>
      </section>
    </main>
  );
}
function App() {
  const [loginUsername, setLoginUsername] = useState("");
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
        username={user?.username || loginUsername}
        notice={notice}
        onLogin={(u) => {
          setLoginUsername(u?.username || user?.username || loginUsername);
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
    await api("/logout", "POST", {});
    setUser(null);
    setPage("dashboard");
  }
  return (
    <div className="app">
      {passwordOpen && (
        <PasswordDialog
          onClose={() => setPasswordOpen(false)}
          onSaved={() => {
            setPasswordOpen(false);
            setNotice("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
            setLoginUsername(user.username);
            setUser(null);
            setPage("dashboard");
          }}
        />
      )}
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหาหลัก
      </a>
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          {config.logo ? (
            <img src={config.logo} alt="โลโก้" />
          ) : (
            <HeartHandshake size={34} />
          )}
          <div>
            อบต.บ้านเสด็จ
            <span>
              ระบบติดตามการช่วยเหลือ
              <br />
              ผู้ประสบปัญหาทางสังคม
            </span>
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
                aria-current={page === id ? "page" : undefined}
                onClick={() => {
                  setPage(id);
                  setMenu(false);
                }}
              >
                <Icon size={20} />
                <span className="nav-label">{label}</span>
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
          <div className="breadcrumb" aria-label="ตำแหน่งหน้าปัจจุบัน">
            <span>พื้นที่ทำงาน</span>
            <ChevronRight size={13} aria-hidden="true" />
            <span aria-current="page">
              {nav.find((n) => n[0] === page)?.[1]}
            </span>
          </div>
          <AccountMenu
            user={user}
            onPassword={() => {
              setPasswordOpen(true);
              setMenu(false);
            }}
            onLogout={logout}
          />
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          <ErrorBox error={error} />
          <div className="page-head">
            <div>
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
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
