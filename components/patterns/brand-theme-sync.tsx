"use client";

import { useEffect } from "react";
import { syncBrandTheme } from "@/lib/brand-theme";

export function BrandThemeSync({ accent }: { accent: string }) {
  useEffect(() => syncBrandTheme(accent), [accent]);
  return null;
}
