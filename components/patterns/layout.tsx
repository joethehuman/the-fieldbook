import type { ComponentProps, ReactNode } from "react";
import { Card } from "../ui/card";
import { cn } from "@/lib/utils";
export function Stack({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="stack"
      className={cn("grid min-w-0 gap-6", className)}
      {...props}
    />
  );
}
export function PageHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "grid gap-2 [&_h1]:text-page [&_h1]:font-semibold [&_h1]:tracking-tight [&>p]:max-w-prose [&>p]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
/** Heading and description always share one column; children are trailing actions. */
export function SectionHeader({
  title,
  description,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div
      data-slot="section-header"
      className={cn(
        "flex min-w-0 flex-wrap items-start justify-between gap-4",
        className,
      )}
      {...props}
    >
      <div
        data-slot="section-heading"
        className="grid min-w-0 flex-1 basis-64 gap-2 [overflow-wrap:anywhere] [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:font-semibold"
      >
        {title}
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div
          data-slot="section-actions"
          className="flex flex-wrap items-center gap-2"
        >
          {children}
        </div>
      )}
    </div>
  );
}
export function CollectionToolbar({
  filters,
  children,
}: {
  filters: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="collection-toolbar"
      className="flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-4"
    >
      <div className="min-w-0">{filters}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
export function StatusActions({
  children,
  actions,
  ...props
}: Omit<ComponentProps<"div">, "role"> & { actions?: ReactNode }) {
  return (
    <div
      data-slot="status-actions"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-2"
      {...props}
    >
      <p role="status">{children}</p>
      {actions}
    </div>
  );
}
export function CardFooter({
  children,
  action,
}: {
  children?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div
      data-slot="card-footer"
      className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground"
    >
      {children}
      <span data-slot="card-action" className="inline-flex items-center gap-2">
        {action}
      </span>
    </div>
  );
}
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      className={cn("flex min-w-0 flex-wrap items-center gap-3", className)}
      {...props}
    />
  );
}
export function FilterBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      className={cn(
        "flex min-w-0 flex-wrap items-end gap-4 rounded-lg border border-border bg-muted/40 p-4 [&>[data-slot=field]]:min-w-40 [&>[data-slot=field]]:flex-1",
        className,
      )}
      {...props}
    />
  );
}
export function EmptyState({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "grid min-w-0 justify-items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 sm:px-8 text-center text-copy [overflow-wrap:anywhere] text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h3]:text-base [&_h3]:font-medium [&_svg]:mx-auto",
        className,
      )}
      {...props}
    />
  );
}
export function ReadingPage({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "mx-auto grid w-full max-w-3xl gap-6 px-4 py-12 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
export function AccountPage({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "mx-auto my-12 grid w-[calc(100%-2rem)] max-w-lg gap-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:my-20 sm:p-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SplitPanel({
  children,
  split = true,
  align = "start",
}: {
  children: React.ReactNode;
  split?: boolean;
  align?: "start" | "stretch";
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-6",
        align === "stretch" ? "items-stretch" : "items-start",
        split && "xl:grid-cols-[18rem_minmax(0,1fr)]",
      )}
    >
      {children}
    </div>
  );
}

export function Callout({ className, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        "flex flex-wrap items-center justify-between gap-6 bg-muted [&_p]:max-w-prose [&_p]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Labeled collection controls share a baseline and wrap into whole fields. */
export function BrowseToolbar({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="browse-toolbar"
      className="flex min-w-0 flex-wrap items-end gap-4 [&>[data-slot=field]]:min-w-40 [&>[data-slot=field]]:flex-1"
    >
      {children}
    </div>
  );
}
