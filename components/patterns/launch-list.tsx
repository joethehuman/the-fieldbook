import type { ReactNode } from "react";
import { ContentAction } from "./content-action";
/** Ordered learner navigation. Unlike the editor's reorder list, this never changes sequence. */
export function LaunchList({
  items,
}: {
  items: {
    id: string;
    title: string;
    description: ReactNode;
    status: ReactNode;
    action: string;
    onClick: () => void;
  }[];
}) {
  return (
    <ol data-slot="launch-list" className="grid list-none gap-3 p-0">
      {items.map((item, index) => (
        <li key={item.id}>
          <ContentAction
            className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
            onClick={item.onClick}
          >
            <span className="text-sm tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <div className="grid min-w-0 gap-2">
              <h2 className="font-semibold [overflow-wrap:anywhere]">
                {item.title}
              </h2>
              <div className="text-sm text-muted-foreground">
                {item.description}
              </div>
              {item.status}
            </div>
            <span className="col-start-2 text-sm sm:col-start-3">
              {item.action} →
            </span>
          </ContentAction>
        </li>
      ))}
    </ol>
  );
}
