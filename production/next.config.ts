import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  output: "standalone",
  // Resolve access, existence and metadata before committing HTTP status.
  htmlLimitedBots: /.*/,
  outputFileTracingRoot: path.join(
    process.cwd(),
    process.cwd().endsWith("production") ? ".." : ".",
  ),
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
