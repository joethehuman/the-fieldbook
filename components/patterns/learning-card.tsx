import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { ContentAction } from "./content-action";
import { IntentLink } from "./intent-link";
import { ContentCardFooter } from "./layout";
import { ProgressStatus } from "../ui/progress";

export function LearningCardFact({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/** Read first, then learning details, with progress and the action together. */
export function LearningCard({
  artwork,
  metadata,
  title,
  description,
  detail,
  status,
  action,
  onClick,
  href,
}: {
  artwork: ReactNode;
  metadata: ReactNode;
  title: string;
  description: string;
  detail?: ReactNode;
  status: { percent: number; complete: boolean; started: boolean };
  action: string;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      {artwork}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <h3 className="min-h-12 text-lg font-semibold leading-6 tracking-tight [overflow-wrap:anywhere]">
          {title}
        </h3>
        <p className="line-clamp-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
        <div
          data-slot="learning-card-metadata"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
        >
          {metadata}
        </div>
        {detail}
        <ContentCardFooter
          action={
            <>
              {action}
              <ArrowRight size={17} aria-hidden="true" />
            </>
          }
        >
          <ProgressStatus
            value={status.percent}
            complete={status.complete}
            started={status.started}
            size="compact"
          />
        </ContentCardFooter>
      </div>
    </>
  );
  return (
    <ContentAction
      asChild={!!href}
      focusRing="inside"
      interaction="lift"
      className="course-card flex h-full min-w-0 flex-col"
      onClick={onClick}
    >
      {href ? <IntentLink href={href}>{content}</IntentLink> : content}
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
