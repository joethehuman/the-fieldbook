"use client";

import { useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { Fragment } from "react";

export type RowAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  separator?: boolean;
};

/** One persistent target for secondary actions, including menu-to-dialog focus. */
export function RowActions({
  label,
  actions,
  disabled = false,
}: {
  label: string;
  actions: RowAction[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${label}`}
          disabled={disabled}
          className="text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          const action = pending.current;
          if (!action) return;
          pending.current = null;
          event.preventDefault();
          trigger.current?.focus({ preventScroll: true });
          // The next dialog must capture the persistent trigger, not a disappearing menu item.
          requestAnimationFrame(action);
        }}
      >
        {actions.map((action) => (
          <Fragment key={action.label}>
            {action.separator && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={action.disabled}
              className={
                action.destructive
                  ? "text-destructive focus:text-destructive"
                  : undefined
              }
              onSelect={() => {
                pending.current = action.onSelect;
              }}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
            {action.disabledReason && (
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                {action.disabledReason}
              </p>
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
