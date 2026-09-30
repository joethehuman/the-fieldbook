import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { assertAppKind } from "./app-kind.mjs";
const kind = process.argv[2];
if (!["installed", "demo"].includes(kind))
  throw new Error("Unknown Fieldbook app kind");
assertAppKind(kind);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, kind === "demo" ? "demo/public" : "public");
mkdirSync(directory, { recursive: true });
writeFileSync(
  `${directory}/fieldbook-build.json`,
  JSON.stringify({
    kind,
    revision:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.FIELDBOOK_BUILD_REVISION ||
      null,
  }) + "\n",
);
