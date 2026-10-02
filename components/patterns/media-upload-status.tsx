import type { UploadProgress } from "@/lib/upload-media";
import { Progress } from "@/components/ui/progress";

export function MediaUploadStatus({
  progress,
}: {
  progress: UploadProgress | null;
}) {
  if (!progress) return null;
  const percent = Math.min(
    100,
    Math.floor((progress.uploaded / progress.total) * 100),
  );
  return (
    <div className="grid gap-2" role="status">
      <p className="text-sm text-muted-foreground">
        {progress.stage === "preparing"
          ? "Preparing upload…"
          : progress.stage === "verifying"
            ? "Checking uploaded file…"
            : `Uploading… ${percent}%`}
      </p>
      {progress.stage === "uploading" && (
        <Progress value={percent} aria-label="File upload progress" />
      )}
    </div>
  );
}
