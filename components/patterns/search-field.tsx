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
        "flex min-w-0 items-center gap-2 [&>svg]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Search size={16} aria-hidden="true" />
      {children}
    </div>
  );
}
