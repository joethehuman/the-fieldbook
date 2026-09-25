"use client";

import { useEffect, useState } from "react";
import { Callout } from "@/components/patterns/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { request } from "@/lib/workspace-save";
import type { GuestProgress } from "@/lib/guest-progress";

const guestKey = "fieldbook.guest-progress.v1";

function savedProgress(): GuestProgress[] {
  try {
    const saved = JSON.parse(localStorage.getItem(guestKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function ReaderGuestImport() {
  const [available, setAvailable] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setAvailable(savedProgress().length > 0), []);

  async function importProgress() {
    setImporting(true);
    setError("");
    let saved = 0;
    try {
      for (const entry of savedProgress()) {
        await request("/api/progress", {
          contentId: entry.content_id,
          version: entry.version,
          lessons: entry.lessons,
          answers: entry.guestAnswers,
        });
        saved++;
        localStorage.setItem(
          guestKey,
          JSON.stringify(
            savedProgress().filter(
              (current) =>
                current.content_id !== entry.content_id ||
                current.version !== entry.version,
            ),
          ),
        );
      }
      localStorage.removeItem(guestKey);
      window.location.reload();
    } catch (cause) {
      setError(
        `${saved} course records imported. ${(cause as Error).message} Your browser progress is still available.`,
      );
      setImporting(false);
    }
  }

  if (!available) return null;
  return (
    <Callout className="m-4" role="region" aria-label="Import browser progress">
      <p>Keep the progress you made before signing in?</p>
      <Button disabled={importing} onClick={importProgress}>
        {importing ? "Importing…" : "Save browser progress to my account"}
      </Button>
      <Button
        variant="link"
        disabled={importing}
        onClick={() => setAvailable(false)}
      >
        Not now
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
    </Callout>
  );
}
