import type { NextConfig } from "next";
import path from "node:path";
import { assertAppKind } from "./scripts/app-kind.mjs";
assertAppKind("installed");
const config: NextConfig = {
  output: "standalone",
  // Resolve access, existence and metadata before committing HTTP status.
  htmlLimitedBots: /.*/,
  outputFileTracingRoot: path.resolve(__dirname),
  outputFileTracingIncludes: {
    "/api/og": [
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf",
      "./node_modules/geist/LICENSE.txt",
      "./public/licenses/apache-2.0.txt",
      "./public/licenses/geist-ofl-1.1.txt",
    ],
  },
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
