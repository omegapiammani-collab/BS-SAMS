import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import {
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { wrangler } from "./local-fixture.mjs";
const { values } = parseArgs({
  options: {
    remote: { type: "boolean" },
    "api-snapshot": { type: "boolean" },
    local: { type: "boolean" },
    "output-dir": { type: "string", default: "backups" },
  },
});
if (Boolean(values.remote) === Boolean(values.local))
  throw new Error("Choose exactly one of --remote or --local");
process.umask(0o077);
const startedAt = new Date().toISOString();
const directory = resolve(
  values["output-dir"],
  `${startedAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const partial = join(directory, "database.partial.sql");
if (values["api-snapshot"]) {
  if (!values.remote) throw new Error("--api-snapshot requires --remote");
  execFileSync("python3", ["scripts/d1-snapshot.py", partial], {
    stdio: "pipe",
  });
} else
  wrangler([
    "d1",
    "export",
    "bs-sams",
    values.remote ? "--remote" : "--local",
    "--output",
    partial,
    "--skip-confirmation",
  ]);
chmodSync(partial, 0o600);
const bytes = readFileSync(partial);
if (!bytes.length)
  throw new Error("Empty backup; no completed backup was published");
const snapshot = join(directory, "database.sql");
renameSync(partial, snapshot);
const manifest = {
  method: values["api-snapshot"]
    ? "single-query-api-snapshot"
    : "native-export",
  database: "bs-sams",
  cloudflareAccountId: values.remote
    ? process.env.CLOUDFLARE_ACCOUNT_ID || null
    : null,
  cloudflareDatabaseId: values["api-snapshot"]
    ? process.env.CLOUDFLARE_DATABASE_ID
    : null,
  source: values.remote ? "remote" : "local",
  startedAt,
  completedAt: new Date().toISOString(),
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
if (values.remote) {
  try {
    manifest.timeTravel = JSON.parse(
      wrangler(["d1", "time-travel", "info", "bs-sams", "--json"]),
    );
  } catch {
    manifest.timeTravel = { unavailable: true };
  }
}
writeFileSync(
  join(directory, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    { snapshot, bytes: manifest.bytes, sha256: manifest.sha256 },
    null,
    2,
  ),
);
