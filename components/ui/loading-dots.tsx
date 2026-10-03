import { cn } from "@/lib/utils";

/** Decorative pending indicator; the owning flow supplies its live status. */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="loading-dots"
      className={cn(
        "inline-flex h-5 items-center gap-1 text-muted-foreground",
        className,
      )}
    >
      <span className="size-1 rounded-full bg-current motion-safe:animate-loading-dot" />
      <span className="size-1 rounded-full bg-current motion-safe:animate-loading-dot [--loading-dot-delay:200ms]" />
      <span className="size-1 rounded-full bg-current motion-safe:animate-loading-dot [--loading-dot-delay:400ms]" />
    </span>
  );
}
