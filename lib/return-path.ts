/** Accept only a Fieldbook reading destination, never an external redirect. */
export function safeReturnPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/courses";
  try {
    const url = new URL(value, "https://fieldbook.invalid");
    if (url.origin !== "https://fieldbook.invalid" || !/^\/(?:courses|curricula|updates|docs|team)(?:\/|$)/.test(url.pathname)) return "/courses";
    return url.pathname + url.search;
  } catch { return "/courses"; }
}
