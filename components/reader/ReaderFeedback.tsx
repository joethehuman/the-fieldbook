"use client";
import { ContentFeedback } from "@/components/patterns/content-feedback";
export function ReaderFeedback({
  contentId,
  expanded = false,
}: {
  contentId: string;
  expanded?: boolean;
}) {
  return (
    <ContentFeedback
      key={contentId}
      expanded={expanded}
      onSave={async (rating, comment, submissionId) => {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentId, rating, comment, submissionId }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            result.error || "Could not save feedback. Try again.",
          );
        return result.id as string;
      }}
    />
  );
}
