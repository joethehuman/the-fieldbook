"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { decodedRecordId } from "@/lib/record-url";

/** Normalize client navigation after the authorized page commits. Fragments
 * never reach the server, so retain them alongside the current return query. */
export function CanonicalRecordUrl({ path, id }: { path: string; id?: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const current = new URL(window.location.href);
    const target = new URL(path, current.origin);
    if (current.pathname.split("/")[1] !== target.pathname.split("/")[1]) return;
    if (id ? decodedRecordId(current.pathname.split("/").at(-1) || "", [{ id }]) !== id : current.pathname !== target.pathname) return;
    const required = new URLSearchParams(target.search);
    target.search = current.search;
    for (const [key, value] of required) target.searchParams.set(key, value);
    target.hash = current.hash;
    if (
      target.pathname !== current.pathname ||
      target.search !== current.search
    )
      window.history.replaceState(
        window.history.state,
        "",
        target.pathname + target.search + target.hash,
      );
  }, [path, pathname, id]);
  return null;
}
