import { Badge } from "../ui/badge";

/** Keep publication state compact and unpublished edits outside the badge. */
export function PublicationStatus({
  published,
  hasUnpublishedChanges = false,
  layout = "stacked",
}: {
  published: boolean;
  hasUnpublishedChanges?: boolean;
  layout?: "stacked" | "inline";
}) {
  const changes = published && hasUnpublishedChanges && (
    <span className="min-w-0 truncate text-xs text-muted-foreground" title="Unpublished edits">
      Unpublished edits
    </span>
  );
  return (
    <span className={layout === "inline"
      ? "inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
      : "inline-flex flex-col items-start gap-1"}>
      {layout === "inline" && changes}
      <Badge variant={published ? "success" : "default"}>
        {published ? "Published" : "Draft"}
      </Badge>
      {layout === "stacked" && changes}
    </span>
  );
}
