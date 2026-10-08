import { Check } from "lucide-react";
import { Badge } from "../ui/badge";
import { Spinner } from "../ui/spinner";

/** Save feedback and publication are separate facts, composed in one quiet row. */
export function EditorSaveStatus({
  status,
  published,
  failed = false,
}: {
  status: string;
  published: boolean;
  failed?: boolean;
}) {
  const state = failed ? "failed" : status === "Saving…" || status === "Uploading…"
    ? "saving" : status === "Saved" ? "saved" : "idle";
  return (
    <div className="editor-save-status">
      <span
        role="status"
        aria-live="polite"
        data-save-state={state}
        className={`editor-status-phrase text-xs leading-5${failed ? " text-destructive" : ""}`}
      >
        <span className="sr-only">
          {status}
        </span>
        <span className="editor-status-wide" aria-hidden="true">
          {status}
        </span>
        <span className="editor-status-compact size-5 items-center justify-center" aria-hidden="true" title={status}>
          {state === "saving" ? <Spinner /> : state === "saved" ? <Check className="size-4" strokeWidth={1.5} /> : null}
        </span>
      </span>
      <Badge variant={published ? "success" : "default"}>
        {published ? "Published" : "Draft"}
      </Badge>
    </div>
  );
}
