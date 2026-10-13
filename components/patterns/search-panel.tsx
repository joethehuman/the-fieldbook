"use client";
import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

/** Responsive surfaces share one owner for the search query and chat session. */
export function SearchPanel({
  id,
  open,
  compact = false,
  fullScreen = false,
  fitContent = false,
  onDismiss,
  trigger,
  children,
  returnFocus,
  persistentContent,
}: {
  id: string;
  open: boolean;
  compact?: boolean;
  fullScreen?: boolean;
  fitContent?: boolean;
  onDismiss: () => void;
  trigger: ReactNode;
  children: ReactNode;
  /** Session owners that must survive panel dismissal; may portal into the panel. */
  persistentContent?: ReactNode;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLElement>(null);
  const measure = useCallback(() => {
    const panel = surface.current;
    if (!panel) return;
    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    const top = viewport?.offsetTop ?? 0;
    panel.style.setProperty(
      "--search-viewport-height",
      `${fullScreen ? height : Math.max(0, top + height - panel.getBoundingClientRect().top - 16)}px`,
    );
    if (fullScreen) {
      panel.style.setProperty("--search-viewport-top", `${top}px`);
      panel.style.setProperty(
        "--search-viewport-left",
        `${viewport?.offsetLeft ?? 0}px`,
      );
      panel.style.setProperty(
        "--search-viewport-width",
        `${viewport?.width ?? window.innerWidth}px`,
      );
    }
  }, [fullScreen]);
  const setSurface = useCallback(
    (element: HTMLElement | null) => {
      surface.current = element;
      if (element) measure();
    },
    [measure],
  );
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [open, compact, measure]);
  useEffect(() => {
    if (!open || fullScreen) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, fullScreen, onDismiss]);
  const escapeHint = (
    <p className="flex shrink-0 items-center justify-end gap-2 px-4 pb-3 text-xs text-muted-foreground">
      <kbd className="search-keycap">Esc</kbd>
      <span>to close</span>
    </p>
  );
  return (
    <div
      ref={root}
      data-slot="search-root"
      data-compact={compact || undefined}
      data-search-open={open || undefined}
      className="group/search-panel relative min-w-0 data-[compact=true]:static"
      onBlur={(event) => {
        if (fullScreen) return;
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          onDismiss();
      }}
      onKeyDown={(event) => {
        if (fullScreen) return;
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          (returnFocus?.current || root.current?.querySelector("input"))?.focus(
            { preventScroll: true },
          );
          onDismiss();
        }
      }}
    >
      {trigger}
      {persistentContent}
      {fullScreen ? (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!next) onDismiss();
          }}
        >
          <DialogContent
            ref={setSurface}
            id={id}
            data-slot="search-panel"
            data-mobile="true"
            aria-describedby={undefined}
            className="workspace-chrome search-mobile-surface translate-x-0 translate-y-0"
            onPointerUpCapture={(event) => {
              const field = event.target;
              if (
                event.pointerType !== "touch" ||
                !event.isPrimary ||
                !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) ||
                field === document.activeElement
              ) return;
              // Focus at the end of a tap without Safari's additional pan.
              // Viewport resizing already brings the composer above the keyboard.
              // Scrolling cancels the pointer; native caret gestures stay intact.
              field.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus?.current?.focus({ preventScroll: true });
            }}
          >
            <DialogTitle className="sr-only">Search Fieldbook</DialogTitle>
            {children}
          </DialogContent>
        </Dialog>
      ) : (
        open && (
          <Card
            ref={setSurface}
            id={id}
            data-slot="search-panel"
            data-fit-content={fitContent || undefined}
            className={`absolute right-0 top-full z-40 mt-2 flex flex-col max-h-[min(40rem,75dvh,var(--search-viewport-height,100dvh),var(--editor-popup-available-height,calc(100dvh-var(--app-bar-height,4rem)-1rem)))] ${fitContent ? "h-auto" : "h-[min(40rem,75dvh,var(--editor-popup-available-height,calc(100dvh-var(--app-bar-height,4rem)-1rem)))]"} w-[var(--search-panel-width,min(48rem,calc(100vw-2rem)))] overflow-hidden p-0 sm:p-0 shadow-xl group-data-[compact=true]/search-panel:inset-x-4 group-data-[compact=true]/search-panel:w-auto`}
          >
            {children}
            {escapeHint}
          </Card>
        )
      )}
    </div>
  );
}
