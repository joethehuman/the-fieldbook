"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
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
  "fixed top-1/2 left-1/2 z-40 grid max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-background p-5 text-foreground shadow-xl outline-none";
export function DialogContent({
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
  side = "center",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "center" | "left" | "right";
}) {
  const returnFocus = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={dialogOverlayClass} />
      <DialogPrimitive.Content
        className={cn(
          side === "center"
            ? dialogContentClass
            : "fixed inset-y-0 z-40 grid h-dvh max-h-dvh w-full max-w-lg content-start gap-4 overflow-y-auto border-border bg-background p-5 text-foreground shadow-xl outline-none",
          side === "left" && "left-0 border-r",
          side === "right" && "right-0 border-l",
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
