import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";

/** The feature owns destination changes and its existing unsaved-change guard. */
export function DetailNavigation({
  items,
  current,
  disabled,
}: {
  items: { label: string; onSelect: () => void | Promise<void> }[];
  current?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <nav aria-label="Navigation context" data-slot="detail-navigation">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li
            key={item.label}
            className="flex min-w-0 max-w-full items-center gap-1"
          >
            {index > 0 && (
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-w-0 max-w-full text-left"
              disabled={disabled}
              onClick={item.onSelect}
            >
              {index === 0 && (
                <ArrowLeft className="size-4" aria-hidden="true" />
              )}
              <span className="[overflow-wrap:anywhere]">{item.label}</span>
            </Button>
          </li>
        ))}
        {current && (
          <li
            aria-current="page"
            className="flex min-w-0 items-center gap-2 px-2"
          >
            <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
            <span className="[overflow-wrap:anywhere]">{current}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
