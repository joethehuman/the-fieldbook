import { organizationHomePath } from "@/lib/navigation";

export function safeNext(
  raw: string | null | undefined,
  fallback = organizationHomePath,
): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(raw)
  )
    return fallback;
  try {
    const url = new URL(raw, "https://fieldbook.invalid");
    return url.origin === "https://fieldbook.invalid" &&
      url.pathname !== "/sign-in" &&
      !url.pathname.startsWith("/auth/")
      ? url.pathname === "/"
        ? fallback
        : url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}
