import { Button } from "../ui/button";

/** Progressive disclosure for a loaded collection; caller owns counts and position. */
export function LoadMore({
  shown,
  total,
  noun,
  onLoadMore,
  loading = false,
}: {
  shown: number;
  total: number;
  noun: string;
  onLoadMore: () => void;
  loading?: boolean;
}) {
  return (
    <div
      data-slot="load-more"
      className="grid gap-3 pt-4"
    >
      <p
        role="status"
        aria-live="polite"
        className="text-copy text-muted-foreground"
      >
        Showing {shown} of {total} {noun}.
      </p>
      {shown < total && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          loading={loading}
          onClick={onLoadMore}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
