import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Activity, never completion percentage. Supply visible text in the owning status. */
export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn("size-4 shrink-0 motion-safe:animate-spin", className)}
    />
  );
}
