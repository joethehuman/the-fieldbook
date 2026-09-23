import { Button } from "../ui/button";

/** Pagination for a collection already loaded by the feature; pages are one-based. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  label = "Results",
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label={`${label} pages`}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p role="status" className="text-copy text-muted-foreground">
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
          : "0 results"}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-copy">
            Page {page} of {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </nav>
  );
}
