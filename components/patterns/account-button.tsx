import type { ComponentProps, ReactNode } from "react";
import { InitialsAvatar } from "../ui/initials-avatar";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
export function AccountButton({
  initials,
  name,
  description,
  icon,
  className,
  actionLabel,
  helpText,
  ...props
}: ComponentProps<typeof Button> & {
  initials: string;
  name: string;
  description: string;
  icon: ReactNode;
  actionLabel: string;
  helpText?: string;
}) {
  return (
    <div
      data-slot="account-button"
      className={cn(
        "grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3 border-t border-border px-2 py-4 text-left",
        className,
      )}
    >
      <InitialsAvatar initials={initials} />
      <span className="min-w-0">
        <span className="block break-words text-sm font-semibold leading-snug">
          {name}
        </span>
        <span className="mt-1 block break-words text-xs font-normal leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
      <Button
        {...props}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={actionLabel}
        title={actionLabel}
      >
        {icon}
      </Button>
      {helpText && (
        <p className="col-span-3 text-xs leading-relaxed text-muted-foreground">
          {helpText}
        </p>
      )}
    </div>
  );
}
