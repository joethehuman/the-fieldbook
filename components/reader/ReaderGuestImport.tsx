"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { restoreGuestProgress } from "@/lib/guest-progress-import";
import { request } from "@/lib/workspace-save";

export function ReaderGuestImport() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode repeats effects; a browser record should be sent only once.
    if (started.current) return;
    started.current = true;
    let storage: Storage;
    try {
      storage = window.localStorage;
    } catch {
      return;
    }
    void restoreGuestProgress(storage, (body) =>
      request("/api/progress", body),
    ).then((saved) => {
      if (saved) router.refresh();
    });
  }, [router]);

  return null;
}
