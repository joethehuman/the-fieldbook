import type { NextConfig } from "next";
import { assertAppKind } from "../scripts/app-kind.mjs";
assertAppKind("demo");
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  webpack(webpackConfig, { dev }) {
    const deploymentId = process.env.NEXT_DEPLOYMENT_ID;
    const cache = webpackConfig.cache;
    // Next embeds the deployment ID in font CSS but omits it from its cache key.
    if (!dev && deploymentId && cache && typeof cache === "object") {
      cache.version = `${cache.version || ""}|deployment:${deploymentId}`;
    }
    return webpackConfig;
  },
};
export default config;
