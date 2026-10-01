import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const composition = new Set([
  "server/data.ts",
  "server/identity.ts",
  "server/storage.ts",
  "server/media-data.ts",
  "server/deployment.ts",
  "server/telemetry.tsx",
  "server/env.ts",
  "server/db.ts",
  "server/read-all.ts",
  "server/cleanup-data.ts",
]);
const violations = [];
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      inspect(path);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const name = relative(root, path).replaceAll("\\", "/");
    if (name.startsWith("server/providers/")) continue;
    const source = readFileSync(path, "utf8");
    if (/["'](?:@supabase\/|@vercel\/(?:analytics|speed-insights))/.test(source))
      violations.push(`${name}: provider SDK import`);
    if (/\bdb\s*\(/.test(source))
      violations.push(`${name}: provider query client`);
    if (
      !composition.has(name) &&
      /(?:from\s*|import\s*\()["'][^"']*providers\//.test(source)
    )
      violations.push(`${name}: bypasses the service composition boundary`);
  }
}
for (const directory of ["app", "demo/app", "server", "lib", "components"])
  inspect(resolve(root, directory));
const proxy = readFileSync(resolve(root, "proxy.ts"), "utf8");
if (/["']@supabase\//.test(proxy))
  violations.push("proxy.ts: provider SDK import");
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else console.log("Provider boundaries passed.");
