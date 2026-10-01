import "server-only";
import { deployment } from "./deployment";
import { VercelTelemetry } from "./providers/vercel/telemetry";

/** Optional host features; product code does not import a telemetry SDK. */
export function Telemetry() {
  if (deployment().host !== "vercel") return null;

  const analytics = process.env.FIELDBOOK_VERCEL_ANALYTICS_ENABLED !== "false";
  const speedInsights =
    process.env.FIELDBOOK_VERCEL_SPEED_INSIGHTS_ENABLED !== "false";
  if (!analytics && !speedInsights) return null;

  return (
    <VercelTelemetry analytics={analytics} speedInsights={speedInsights} />
  );
}
