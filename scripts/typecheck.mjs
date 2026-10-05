import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const tsc = resolve("node_modules/typescript/bin/tsc");
const projects = [
  [],
  ...(existsSync("demo") ? [["-p", "demo/tsconfig.json"]] : []),
];

for (const project of projects) {
  const result = spawnSync(process.execPath, [tsc, "--noEmit", ...project], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
