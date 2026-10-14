import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertAppKind } from "./scripts/app-kind.mjs";
assertAppKind("installed");
const dependencies = createHash("sha256").update(readFileSync(path.resolve(__dirname, "pnpm-lock.yaml"))).digest("hex");
const config: NextConfig = {
  output: "standalone",
  // Development keeps Next's default Turbopack; builds explicitly use Webpack.
  turbopack: {},
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
  webpack(webpackConfig) {
    const cache = webpackConfig.cache;
    // Patched packages keep their upstream version. Include the locked patch
    // hashes so persistent builds cannot reuse an older dependency body.
    if (cache && typeof cache === "object" && cache.type === "filesystem") {
      cache.version = `${cache.version || ""}|dependencies:${dependencies}`;
    }
    return webpackConfig;
  },
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
