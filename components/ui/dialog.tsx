"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogClose = DialogPrimitive.Close;
export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-copy text-muted-foreground", className)}
      {...props}
    />
  );
}
export const dialogOverlayClass = "fixed inset-0 z-40 bg-overlay";
export const dialogContentClass =
  "aria-hidden:hidden fixed top-1/2 left-1/2 z-40 grid max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-background p-5 text-foreground shadow-xl outline-none";
export function DialogContent({
  className,
  size = "default",
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: "default" | "media";
}) {
  const returnFocus = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className={dialogOverlayClass}
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          dialogContentClass,
          size === "media" &&
            "h-[calc(100dvh-3rem)] w-[calc(100vw-2rem)] max-w-[var(--page-width)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden",
          className,
        )}
        {...props}
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented && returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      />
    </DialogPrimitive.Portal>
  );
}

/** Full-width action surface; place last in DialogContent or its form. */
export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-5 -mb-5 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-border bg-surface px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
