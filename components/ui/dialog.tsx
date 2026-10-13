"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
const DialogModalContext = React.createContext(true);
export function Dialog({
  modal = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return (
    <DialogModalContext.Provider value={modal}>
      <DialogPrimitive.Root modal={modal} {...props} />
    </DialogModalContext.Provider>
  );
}
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
export const dialogOverlayClass =
  "[&:has(~_[data-slot=dialog-overlay][data-state=open])]:hidden fixed inset-0 top-[var(--dialog-viewport-top,0px)] left-[var(--dialog-viewport-left,0px)] z-40 h-[var(--dialog-viewport-height,auto)] w-[var(--dialog-viewport-width,auto)] bg-overlay";
export const dialogContentClass =
  "fixed top-[var(--dialog-viewport-center,50%)] left-[var(--dialog-viewport-center-x,50%)] z-40 grid max-h-[calc(var(--dialog-viewport-height,100dvh)-3rem)] w-[calc(var(--dialog-viewport-width,100%)-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-background p-5 text-foreground shadow-floating outline-none";
export function DialogContent({
  className,
  size = "default",
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?:
    | "default"
    | "media"
    | "picker"
    | "selection"
    | "workflow"
    | "workflow-list"
    | "assignment"
    | "sheet";
}) {
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const modal = React.useContext(DialogModalContext);
  const content = (
    <DialogPrimitive.Content
      data-slot="dialog-content"
      data-size={size}
      className={cn(
        dialogContentClass,
        size === "sheet" &&
          "top-auto bottom-[var(--phone-panel-bottom,var(--dialog-viewport-bottom,0px))] left-[var(--dialog-viewport-left,0px)] flex max-h-[calc(var(--phone-panel-height,var(--dialog-viewport-height,100dvh))-1rem)] w-[var(--dialog-viewport-width,100%)] max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-b-none pb-[calc(var(--space-8)+env(safe-area-inset-bottom))]",
        size === "media" &&
          "h-[calc(var(--dialog-viewport-height,100dvh)-3rem)] w-[calc(var(--dialog-viewport-width,100vw)-2rem)] max-w-[var(--page-width)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden",
        size === "selection" &&
          "flex h-[min(48rem,calc(var(--dialog-viewport-height,100dvh)-3rem))] max-w-3xl flex-col overflow-hidden",
        size === "picker" &&
          "flex flex-col overscroll-y-contain [&>:not([data-slot=dialog-body])]:shrink-0 [&>[data-slot=dialog-body]]:min-h-[var(--dialog-picker-body-min-height)]",
        (size === "workflow" || size === "workflow-list") &&
          "flex h-[calc(var(--dialog-viewport-height,100dvh)-2rem)] sm:h-[min(var(--dialog-workflow-height),calc(var(--dialog-viewport-height,100dvh)-2rem))] max-h-[calc(var(--dialog-viewport-height,100dvh)-2rem)] max-w-[var(--dialog-workflow-width)] flex-col overflow-hidden",
        size === "workflow-list" &&
          "[--dialog-workflow-height:var(--dialog-workflow-list-height)]",
        size === "assignment" &&
          "flex h-[calc(var(--dialog-viewport-height,100dvh)-2rem)] max-h-[calc(var(--dialog-viewport-height,100dvh)-2rem)] max-w-6xl flex-col gap-3 overflow-hidden max-md:top-[var(--dialog-viewport-top,0px)] max-md:left-[var(--dialog-viewport-left,0px)] max-md:h-[var(--dialog-viewport-height,100dvh)] max-md:max-h-[var(--dialog-viewport-height,100dvh)] max-md:w-[var(--dialog-viewport-width,100%)] max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:pt-[max(1.25rem,env(safe-area-inset-top))] max-md:[&>[data-slot=dialog-footer]]:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
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
          returnFocus.current.focus({ preventScroll: !!returnFocus.current.closest('.app[data-mobile-editor-boundary]') });
        }
      }}
    />
  );
  return (
    <DialogPrimitive.Portal>
      {modal ? (
        // Keep portaled popup events within Radix's scroll-lock React tree.
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          data-size={size}
          className={dialogOverlayClass}
        >
          {content}
        </DialogPrimitive.Overlay>
      ) : (
        content
      )}
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
        "-mx-5 -mb-5 mt-2 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-border bg-surface px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

/** Picker and workflow dialogs reserve a flexible body between heading and actions. */
export function DialogBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-hidden", className)}
      {...props}
    />
  );
}

/** Informational steps within one workflow; navigation belongs to its actions. */
export function DialogSteps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol
      aria-label="Steps"
      className="flex shrink-0 gap-6 border-b border-border text-sm"
    >
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={current === index ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 border-b-2 border-transparent pb-3 text-muted-foreground",
            current === index && "border-foreground text-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-full border border-border text-xs",
              current === index &&
                "border-foreground bg-foreground text-background",
            )}
          >
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}
