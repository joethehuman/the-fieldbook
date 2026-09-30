import type { NextConfig } from "next";
import { assertAppKind } from "../scripts/app-kind.mjs";
assertAppKind("demo");
const config: NextConfig = { output: "export", images: { unoptimized: true } };
export default config;
