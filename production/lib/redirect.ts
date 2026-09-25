import { organizationHomePath } from "@/lib/navigation";

export function safeNext(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(raw)
  )
    return organizationHomePath;
  try {
    const url = new URL(raw, "https://fieldbook.invalid");
    return url.origin === "https://fieldbook.invalid" &&
      url.pathname !== "/sign-in" &&
      !url.pathname.startsWith("/auth/")
      ? url.pathname === "/"
        ? organizationHomePath
        : url.pathname + url.search + url.hash
      : organizationHomePath;
  } catch {
    return organizationHomePath;
  }
}
