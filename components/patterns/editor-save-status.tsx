import { Check } from "lucide-react";
import { Badge } from "../ui/badge";

/** Save feedback and publication are separate facts, composed in one quiet row. */
export function EditorSaveStatus({
  status,
  published,
  hasUnpublishedChanges = false,
  failed = false,
}: {
  status: string;
  published: boolean;
  hasUnpublishedChanges?: boolean;
  failed?: boolean;
}) {
  const showChanges = published && hasUnpublishedChanges && !failed;
  const savedChanges = showChanges && status === "Saved";
  const compactStatus = failed ? "Not saved" : status;
  return (
    <div className="editor-save-status">
      <span
        role="status"
        aria-live="polite"
        className={`editor-status-phrase text-xs leading-5${failed ? " text-destructive" : ""}`}
      >
        <span className="sr-only">
          {status}{showChanges ? ". Unpublished edits" : ""}
        </span>
        <span className="editor-status-wide" aria-hidden="true">
          {status}
          {showChanges && <>
            <span className="editor-status-separator">·</span>
            <span>Unpublished edits</span>
          </>}
        </span>
        <span className="editor-status-compact" aria-hidden="true">
          {savedChanges ? <><Check className="size-3" />Unpublished</> : compactStatus}
        </span>
      </span>
      <Badge variant={published ? "success" : "default"}>
        {published ? "Published" : "Draft"}
      </Badge>
    </div>
  );
}
