import type { ComponentProps } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
export function SearchField({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="search-field"
      className={cn(
        "relative flex min-w-0 items-center gap-2 [&>[data-slot=input]]:pl-9 [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:left-3 [&>svg]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Search size={16} aria-hidden="true" />
      {children}
    </div>
  );
}
