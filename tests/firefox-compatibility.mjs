import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import assert from "node:assert/strict";
export async function testFirefox({
  origin,
  password,
  output,
  binary,
  driver,
  libraryDir,
}) {
  const directory = mkdtempSync(join(tmpdir(), "bs-sams-firefox-qa-"));
  const downloads = join(output, "firefox-downloads");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(downloads, { recursive: true });
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const child = spawn(
    driver,
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--profile-root",
      directory,
    ],
    {
      env: {
        ...process.env,
        ...(libraryDir ? { LD_LIBRARY_PATH: libraryDir } : {}),
        XDG_CACHE_HOME: directory,
        MOZ_DISABLE_CONTENT_SANDBOX: "1",
      },
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  let session, ws;
  const errors = [];
  const entry = { name: "firefox-desktop-and-zoom200", checks: [] };
  async function wait(test, label, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await test()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error(label);
  }
  async function command(method, path, body) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000),
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.value?.message || "Firefox WebDriver failed");
    return data.value;
  }
  const run = (script, args = []) =>
    command("POST", `/session/${session}/execute/sync`, { script, args });
  async function find(selector, text) {
    return run(
      "return [...document.querySelectorAll(arguments[0])].find(el=>arguments[1]===null||el.textContent.trim()===arguments[1])||null",
      [selector, text ?? null],
    );
  }
  async function click(selector, text) {
    const element = await find(selector, text);
    assert.ok(element, `Firefox control missing: ${selector} ${text || ""}`);
    await command(
      "POST",
      `/session/${session}/element/${element["element-6066-11e4-a52e-4f735466cecf"]}/click`,
      {},
    );
  }
  async function fill(selector, text) {
    const element = await find(selector);
    assert.ok(element);
    const path = `/session/${session}/element/${element["element-6066-11e4-a52e-4f735466cecf"]}`;
    await command("POST", path + "/clear", {});
    await command("POST", path + "/value", { text });
  }
  async function screenshot(name) {
    const data = await command("GET", `/session/${session}/screenshot`);
    writeFileSync(join(output, name), Buffer.from(data, "base64"));
  }
  async function nav(text) {
    if (
      await run(
        "return document.querySelector('.sidebar').getBoundingClientRect().right<=0",
      )
    )
      await click('button[aria-label="เปิดเมนู"]');
    await click("nav button", text);
  }
  try {
    await wait(async () => {
      try {
        return (await command("GET", "/status")).ready;
      } catch {
        return false;
      }
    }, "Geckodriver did not start");
    const created = await command("POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "firefox",
          webSocketUrl: true,
          "moz:firefoxOptions": {
            binary,
            args: ["-headless", "--remote-allow-system-access"],
            prefs: {
              "security.sandbox.content.level": 0,
              "browser.download.folderList": 2,
              "browser.download.dir": downloads,
              "browser.download.useDownloadDir": true,
              "browser.helperApps.neverAsk.saveToDisk":
                "application/pdf,application/octet-stream",
              "pdfjs.disabled": true,
            },
          },
        },
      },
    });
    session = created.sessionId;
    entry.engine = `Firefox ${created.capabilities.browserVersion}`;
    ws = new WebSocket(created.capabilities.webSocketUrl);
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = j;
    });
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (
        message.method === "log.entryAdded" &&
        message.params.type === "javascript" &&
        message.params.level === "error"
      )
        errors.push(message.params.text);
    };
    ws.send(
      JSON.stringify({
        id: 1,
        method: "session.subscribe",
        params: { events: ["log.entryAdded"] },
      }),
    );
    await command("POST", `/session/${session}/window/rect`, {
      width: 1536,
      height: 1024,
    });
    await command("POST", `/session/${session}/url`, { url: origin });
    await wait(
      () => find('input[name="username"]'),
      "Firefox login did not render",
    );
    await fill('input[name="username"]', "device-admin");
    await fill('input[name="password"]', password);
    await click("button", "เข้าสู่ระบบ");
    await wait(
      () =>
        run(
          "return document.querySelector('h1')?.textContent==='ภาพรวมการช่วยเหลือ'&&!!document.querySelector('.metric strong')",
        ),
      "Firefox login/dashboard failed",
    );
    assert.equal(
      await run("return document.documentElement.scrollWidth>innerWidth+1"),
      false,
    );
    entry.checks.push("Native WebDriver login and dashboard render");
    await nav("ทะเบียนผู้ประสบปัญหา");
    await wait(
      () =>
        run("return document.body.textContent.includes('ทั้งหมด 1000 รายการ')"),
      "Firefox registry failed",
    );
    await click('button[aria-label="แก้ไข ทดสอบอุปกรณ์0000"]');
    await click(".request-group > summary");
    await click('button[aria-label="ไปที่คำขอที่ 1"]');
    await wait(
      () =>
        run(
          "const h=document.querySelector('.request-card h3'),d=h?.closest('dialog');return !!h&&h.getBoundingClientRect().top>=d.querySelector('.modal-head').getBoundingClientRect().bottom",
        ),
      "Firefox request jump failed",
    );
    await click('.request-card [data-field$=".date"]');
    await wait(
      () =>
        run("return !!document.querySelector('.thai-calendar:popover-open')"),
      "Firefox calendar failed",
    );
    assert.equal(
      await run(
        "const r=document.querySelector('.thai-calendar:popover-open').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1",
      ),
      true,
    );
    await click(".thai-calendar:popover-open button", "ยกเลิก");
    await fill('[data-field="nationalId"]', "1234567890122");
    await click("button", "บันทึกข้อมูล");
    await wait(
      () => run("return document.activeElement?.dataset.field==='nationalId'"),
      "Firefox error field did not receive focus",
    );
    await screenshot("firefox-desktop-form.png");
    entry.checks.push(
      "Dialog, request focus, Thai calendar, inline validation",
    );
    await click(".modal-actions button", "ยกเลิก");
    await click("button", "ละทิ้งการเปลี่ยนแปลง");
    const existing = new Set(readdirSync(downloads));
    await click("button", "PDF");
    let pdf;
    await wait(
      async () => {
        pdf = readdirSync(downloads).find(
          (name) => name.endsWith(".pdf") && !existing.has(name),
        );
        return (
          pdf && !readdirSync(downloads).some((name) => name.endsWith(".part"))
        );
      },
      "Firefox PDF download failed",
      90000,
    );
    assert.equal(
      readFileSync(join(downloads, pdf)).subarray(0, 5).toString(),
      "%PDF-",
    );
    entry.checks.push("1,000-person PDF downloaded in Firefox");
    await nav("รายงานและส่งออก");
    await wait(
      () =>
        run("return document.body.textContent.includes('รายละเอียดรายเดือน')"),
      "Firefox reports failed",
    );
    entry.beforeZoom = await run(
      "return {innerWidth,innerHeight,devicePixelRatio,outerWidth}",
    );
    await command("POST", `/session/${session}/moz/context`, {
      context: "chrome",
    });
    await run(`window.gBrowser.selectedBrowser.fullZoom = 2;
      return window.gBrowser.selectedBrowser.fullZoom;`);
    await command("POST", `/session/${session}/moz/context`, {
      context: "content",
    });
    await wait(
      () => run("return devicePixelRatio >= 1.99"),
      "Firefox native zoom did not apply",
    );
    entry.zoom200 = await run(
      "return {innerWidth,innerHeight,devicePixelRatio,outerWidth}",
    );
    assert.ok(
      Math.abs(
        entry.zoom200.devicePixelRatio / entry.beforeZoom.devicePixelRatio - 2,
      ) < 0.02,
      "Firefox did not reach browser zoom 200%",
    );
    assert.equal(
      await run("return document.documentElement.scrollWidth>innerWidth+1"),
      false,
    );
    await screenshot("firefox-zoom200-reports.png");
    entry.checks.push(
      "Native browser fullZoom 200% verified by CSS viewport and devicePixelRatio; no page overflow",
    );
    assert.deepEqual(errors, []);
    entry.pageErrors = errors;
    entry.status = "passed";
    return entry;
  } catch (error) {
    entry.status = "failed";
    entry.error = error.message;
    error.compatibilityEntry = entry;
    throw error;
  } finally {
    ws?.close();
    if (session)
      try {
        await command("DELETE", `/session/${session}`);
      } catch {}
    child.kill();
    if (child.exitCode === null)
      await new Promise((r) => child.once("exit", r));
    rmSync(directory, { recursive: true, force: true });
  }
}
