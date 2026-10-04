import "server-only";
import { cache } from "react";
import { publicBranding } from "./branding";
import { deployment } from "./deployment";
import { ogCardIdentity } from "../lib/og-card";

/** Uses only the existing pre-login identity projection. Never reads content. */
export const installationOgIdentity = cache(async () => {
  let origin: string | undefined;
  try {
    origin = deployment().origin;
    return ogCardIdentity(await publicBranding(), origin);
  } catch {
    // Branding/service failures must not expose errors or guess a public access mode.
    return ogCardIdentity({}, origin);
  }
});
