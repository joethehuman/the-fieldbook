"use client";

import { useEffect, useState } from "react";
import { brandingFromSettings, type Branding } from "@/lib/branding";

/** Recovery screens can load only the installation's public identity. */
export function usePublicBranding() {
  const [branding, setBranding] = useState<Branding>(() =>
    brandingFromSettings({}),
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/branding", { signal: controller.signal, cache: "no-store" })
      .then(async (response) =>
        response.ok ? ((await response.json()) as Branding) : null,
      )
      .then((value) => {
        if (value && !controller.signal.aborted) setBranding(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return branding;
}
