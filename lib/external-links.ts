export const maxExternalLinks = 3;
export const maxExternalLinkLabelLength = 40;
export const maxExternalLinkUrlLength = 2000;

export type ExternalLink = { id: string; label: string; url: string };

export function externalLinkLabelError(label: string): string | undefined {
  if (!label.trim()) return "Enter a label for this link.";
  if (label.trim().length > maxExternalLinkLabelLength)
    return `Use ${maxExternalLinkLabelLength} characters or fewer.`;
}

export function externalLinkUrlError(value: string): string | undefined {
  const url = value.trim();
  if (!url) return "Enter a URL for this link.";
  if (url.length <= maxExternalLinkUrlLength && !/\s/.test(url)) {
    try {
      const parsed = new URL(url);
      if (
        /^https?:\/\//i.test(url) &&
        ["http:", "https:"].includes(parsed.protocol) &&
        parsed.hostname &&
        !parsed.username &&
        !parsed.password
      )
        return;
    } catch {
      // Show the same field guidance for malformed and unsupported addresses.
    }
  }
  return "Use a full http:// or https:// URL without spaces or sign-in details.";
}

/** Saved configuration can predate validation; never render an unsafe address. */
export function accountMenuLinks(value: unknown): ExternalLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (link): link is ExternalLink =>
        !!link &&
        typeof link.id === "string" &&
        typeof link.label === "string" &&
        typeof link.url === "string" &&
        !externalLinkLabelError(link.label) &&
        !externalLinkUrlError(link.url),
    )
    .slice(0, maxExternalLinks)
    .map(({ id, label, url }) => ({
      id,
      label: label.trim(),
      url: url.trim(),
    }));
}
