import { PageHeader } from "@/components/patterns/layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading team progress"
      className="grid gap-6"
    >
      <PageHeader>
        <h1>Team progress</h1>
      </PageHeader>
      <div className="grid gap-4" aria-hidden="true">
        <Skeleton className="h-7 w-48 max-w-full" />
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-10 w-52 max-w-full" />
          <Skeleton className="h-10 w-52 max-w-full" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
