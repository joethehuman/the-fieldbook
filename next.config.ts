import type { NextConfig } from "next";
import path from "node:path";
import { assertAppKind } from "./scripts/app-kind.mjs";
assertAppKind("installed");
const config: NextConfig = {
  output: "standalone",
  // Resolve access, existence and metadata before committing HTTP status.
  htmlLimitedBots: /.*/,
  outputFileTracingRoot: path.resolve(__dirname),
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
