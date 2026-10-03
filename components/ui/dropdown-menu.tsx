"use client";
import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        "px-3 py-2 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuContent({
  className,
  sideOffset = 5,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[min(12.5rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-y-contain rounded-xl border border-border bg-popover p-1 pe-3 [scrollbar-gutter:stable] text-popover-foreground shadow-floating",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex min-h-9 cursor-default select-none items-center gap-2 rounded-sm px-3 py-2 text-label [overflow-wrap:anywhere] outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:text-disabled-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuSeparator(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>,
) {
  return (
    <DropdownMenuPrimitive.Separator
      className="my-1 h-px bg-border"
      {...props}
    />
  );
}
