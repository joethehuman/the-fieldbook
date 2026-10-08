import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Call only after access and record availability have been checked. */
export async function normalizeReaderUrl(path: string) {
  const requestHeaders = await headers();
  // RSC navigation normalizes on the client so the browser-only fragment is
  // carried through the URL change. Direct HTML still resolves before render.
  if (requestHeaders.get("x-fieldbook-reader-navigation") === "client") return;
  const current = requestHeaders.get("x-fieldbook-reader-return");
  if (!current) return;
  const url = new URL(current, "https://fieldbook.invalid");
  const target = new URL(path, "https://fieldbook.invalid");
  const query = new URLSearchParams(url.search);
  let changed = false;
  for (const [key, value] of target.searchParams) {
    if (query.get(key) !== value) {
      query.set(key, value);
      changed = true;
    }
  }
  if (url.pathname !== target.pathname || changed)
    redirect(
      target.pathname +
        (changed ? (query.size ? `?${query}` : "") : url.search),
    );
}
