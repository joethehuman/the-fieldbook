import { Badge } from "../ui/badge";

/** Keep publication state compact and unpublished edits outside the badge. */
export function PublicationStatus({
  published,
  hasUnpublishedChanges = false,
}: {
  published: boolean;
  hasUnpublishedChanges?: boolean;
}) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge variant={published ? "success" : "default"}>
        {published ? "Published" : "Draft"}
      </Badge>
      {published && hasUnpublishedChanges && (
        <span className="text-xs text-muted-foreground">Unpublished edits</span>
      )}
    </span>
  );
}
