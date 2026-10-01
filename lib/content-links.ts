export type ContentLinkContext = "article" | "course";

/** Recognizable web addresses may omit HTTPS; authored paths retain their meaning. */
export function normalizeContentLink(href: string): string {
  const value = href.trim();
  if (!/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+(?:[a-z]{2,63}|xn--[a-z\d-]+)(?::\d{1,5})?(?:[/?#]|$)/i.test(value)) return value;
  // A filename in Markdown is also a valid relative link, not necessarily a host.
  if (/\.(?:md|mdx|html?|txt|pdf|json|csv|png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(value.split("/")[0])) return value;
  try {
    return new URL(`https://${value}`).hostname ? `https://${value}` : value;
  } catch {
    return value;
  }
}

/** Authored links have one predictable policy without adding fields to Markdown. */
export function contentLinkTarget(
  href: string | undefined,
  context: ContentLinkContext,
  sameSiteOrigins: readonly string[] = [],
): "_blank" | undefined {
  if (!href) return undefined;
  href = normalizeContentLink(href);
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
