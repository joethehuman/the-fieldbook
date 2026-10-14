import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertAppKind } from "../scripts/app-kind.mjs";
assertAppKind("demo");
const dependencies = createHash("sha256").update(readFileSync(path.resolve(__dirname, "../pnpm-lock.yaml"))).digest("hex");
const config: NextConfig = {
  output: "export",
  // Development keeps Next's default Turbopack; builds explicitly use Webpack.
  turbopack: {},
  images: { unoptimized: true },
  webpack(webpackConfig, { dev }) {
    const deploymentId = process.env.NEXT_DEPLOYMENT_ID;
    const cache = webpackConfig.cache;
    // pnpm patches change dependency code without changing its upstream version.
    if (cache && typeof cache === "object" && cache.type === "filesystem") {
      cache.version = `${cache.version || ""}|dependencies:${dependencies}`;
    }
    // Next embeds the deployment ID in font CSS but omits it from its cache key.
    if (!dev && deploymentId && cache && typeof cache === "object") {
      cache.version = `${cache.version || ""}|deployment:${deploymentId}`;
    }
    return webpackConfig;
  },
};
export default config;
