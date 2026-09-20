import type { ComponentProps, ReactNode } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
export function AccountButton({
  initials,
  name,
  description,
  icon,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  initials: string;
  name: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      data-slot="account-button"
      className={cn(
        "grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_1rem] items-center gap-3 border-t border-border px-2 py-4 text-left",
        className,
      )}
      {...props}
    >
      <span className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold">
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block break-words text-sm font-semibold leading-snug">
          {name}
        </span>
        <span className="mt-1 block break-words text-xs font-normal leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
      {icon}
    </Button>
  );
}
