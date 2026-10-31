import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
process.umask(0o077);
export const fixtureEnv = {
  ...process.env,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || resolve(".wrangler/config"),
  WRANGLER_LOG_PATH:
    process.env.WRANGLER_LOG_PATH || join(tmpdir(), "bs-sams-operations.log"),
};
export function wrangler(args) {
  try {
    return execFileSync(
      process.execPath,
      ["node_modules/wrangler/bin/wrangler.js", ...args],
      {
        env: fixtureEnv,
        encoding: "utf8",
        stdio: "pipe",
        maxBuffer: 32 * 1024 * 1024,
      },
    );
  } catch {
    // Do not print SQL, credentials, or signed export URLs from child output.
    throw new Error(
      `Wrangler ${args.slice(0, 2).join(" ")} failed; inspect the protected Wrangler log.`,
    );
  }
}
export function localFixture() {
  const directory = mkdtempSync(join(tmpdir(), "bs-sams-operations-"));
  const state = join(directory, "state");
  return {
    directory,
    state,
    sql(text) {
      const file = join(directory, "fixture.sql");
      writeFileSync(file, text, { mode: 0o600 });
      return wrangler([
        "d1",
        "execute",
        "bs-sams",
        "--local",
        "--persist-to",
        state,
        "--file",
        file,
        "--json",
      ]);
    },
    migrate() {
      wrangler([
        "d1",
        "migrations",
        "apply",
        "bs-sams",
        "--local",
        "--persist-to",
        state,
      ]);
    },
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
export async function startWorker(state) {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const worker = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      state,
    ],
    {
      env: fixtureEnv,
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  const stop = async () => {
    if (worker.exitCode !== null) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        worker.kill("SIGKILL");
        resolve();
      }, 5000);
      worker.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      worker.kill("SIGTERM");
    });
  };
  const origin = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (worker.exitCode !== null)
        throw new Error("Isolated Worker exited before readiness");
      try {
        if ((await fetch(origin + "/api/me")).status === 401)
          return { origin, stop };
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Isolated Worker readiness timed out");
  } catch (error) {
    await stop();
    throw error;
  }
}
