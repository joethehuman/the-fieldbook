import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { ContentAction } from "./content-action";
import { CardFooter } from "./layout";
import { ProgressStatus } from "../ui/progress";

/** Shared course/playlist anatomy. Text remains readable; actions align at the bottom. */
export function LearningCard({
  artwork,
  metadata,
  title,
  description,
  detail,
  status,
  action,
  onClick,
}: {
  artwork: ReactNode;
  metadata: ReactNode;
  title: string;
  description: string;
  detail?: ReactNode;
  status: { percent: number; complete: boolean; started: boolean };
  action: string;
  onClick: () => void;
}) {
  return (
    <ContentAction
      focusRing="inside"
      className="course-card flex h-full min-w-0 flex-col"
      onClick={onClick}
    >
      {artwork}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="grid gap-2 text-xs text-muted-foreground">
          <span>{metadata}</span>
          <ProgressStatus
            value={status.percent}
            complete={status.complete}
            started={status.started}
          />
        </div>
        <h3 className="min-h-12 font-semibold [overflow-wrap:anywhere]">
          {title}
        </h3>
        {detail}
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
        <CardFooter
          action={
            <>
              {action}
              <ArrowUpRight size={17} />
            </>
          }
        />
      </div>
    </ContentAction>
  );
}
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="card-grid"
      className="grid min-w-0 auto-rows-fr grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4"
    >
      {children}
    </div>
  );
}
