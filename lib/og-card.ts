import { defaultBrandAccent } from "./brand-theme";

/** The complete public input contract; templates never receive content or accounts. */
export type OgCardIdentity = {
  name: string;
  domain: string;
  accent: string;
};

export const ogCardSize = { width: 1200, height: 630 } as const;
export const ogCardPath = "/api/og?v=1";

export function ogCardIdentity(
  identity: { name?: string; accent?: string },
  origin?: string,
): OgCardIdentity {
  let domain = "";
  try {
    const url = new URL(origin || "");
    if (["https:", "http:"].includes(url.protocol)) domain = url.host;
  } catch {
    // An unconfigured installation gets the generic card, not an invented address.
  }
  return {
    name: identity.name?.trim().slice(0, 60) || "Fieldbook",
    domain,
    accent: /^#[0-9a-f]{6}$/i.test(identity.accent || "")
      ? identity.accent!
      : defaultBrandAccent,
  };
}

/** Explicitly reuse on child metadata: Next.js replaces nested metadata objects. */
export function ogCardImages(origin: string, name: string) {
  const image = {
    url: new URL(ogCardPath, origin).href,
    ...ogCardSize,
    alt: `${name} — Updates, Courses and Docs`,
  };
  return {
    openGraph: { images: [image] },
    twitter: { card: "summary_large_image" as const, images: [image] },
  };
}
