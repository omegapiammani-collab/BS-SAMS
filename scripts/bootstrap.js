import { hashPassword } from "../server/auth.js";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12)
  throw new Error(
    "Set ADMIN_PASSWORD with at least 12 characters. This command creates a local administrator only.",
  );
const path = join(tmpdir(), `bs-sams-${crypto.randomUUID()}.sql`);
const hash = await hashPassword(password);
writeFileSync(
  path,
  `INSERT OR IGNORE INTO users VALUES('admin','admin','ผู้ดูแลระบบ','${hash}','admin','[]','[]',1,1);`,
  { mode: 0o600 },
);
try {
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "bs-sams", "--local", "--file", path],
    { stdio: "inherit" },
  );
} finally {
  unlinkSync(path);
}
