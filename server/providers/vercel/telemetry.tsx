"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export function VercelTelemetry({
  analytics,
  speedInsights,
}: {
  analytics: boolean;
  speedInsights: boolean;
}) {
  return (
    <>
      {analytics && <Analytics />}
      {speedInsights && <SpeedInsights />}
    </>
  );
}
