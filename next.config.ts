import type { NextConfig } from "next";
import path from "node:path";
import { assertAppKind } from "./scripts/app-kind.mjs";
assertAppKind("installed");
const config: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  // Next 16.3.5 can report an empty variation set for request-time reader
  // segments. Keep full route-param keys so different items never share a panel.
  experimental: { varyParams: false },
  // Keep reader metadata blocking. Proxy separately establishes admission/status.
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
