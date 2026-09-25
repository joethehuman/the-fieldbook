export type ContentLinkContext = "article" | "course";

/** Authored links have one predictable policy without adding fields to Markdown. */
export function contentLinkTarget(
  href: string | undefined,
  context: ContentLinkContext,
  sameSiteOrigins: readonly string[] = [],
): "_blank" | undefined {
  if (!href) return undefined;
  if (context === "course") return "_blank";

  // Relative links and fragments stay within the current installation.
  if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return undefined;
  try {
    const url = new URL(href, "https://fieldbook.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return sameSiteOrigins.includes(url.origin) ? undefined : "_blank";
  } catch {
    return undefined;
  }
}
