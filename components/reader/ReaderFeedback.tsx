"use client";
import { useEffect, useState } from "react";
import { ContentFeedback } from "@/components/patterns/content-feedback";
export function ReaderFeedback({ contentId }: { contentId: string }) {
  const [current, setCurrent] = useState<{
    rating: "up" | "down";
    comment: string;
  }>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    fetch(`/api/feedback?contentId=${encodeURIComponent(contentId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : { saved: null }))
      .then((result) => {
        if (!controller.signal.aborted) setCurrent(result.saved || undefined);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [contentId]);
  if (!loaded) return null;
  return (
    <ContentFeedback
      saved={current}
      onSave={async (rating, comment) => {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentId, rating, comment }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(
            result.error || "Could not save feedback. Try again.",
          );
        }
        setCurrent({ rating, comment });
      }}
    />
  );
}
