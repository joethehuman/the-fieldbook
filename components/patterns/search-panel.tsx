"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Card } from "../ui/card";

/** Stable nonmodal surface; children own scrolling within the available height. */
export function SearchPanel({
  id,
  open,
  compact = false,
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
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const measure = () => {
      const panel = surface.current;
      if (!panel) return;
      const bottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      panel.style.setProperty(
        "--search-viewport-height",
        `${Math.max(0, bottom - panel.getBoundingClientRect().top - 16)}px`,
      );
    };
    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [open, compact]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, onDismiss]);
  return (
    <div
      ref={root}
      data-slot="search-root"
      data-compact={compact || undefined}
      className="group/search-panel relative min-w-0 data-[compact=true]:static"
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          onDismiss();
      }}
      onKeyDown={(event) => {
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
      {open && (
        <Card
          ref={surface}
          id={id}
          data-slot="search-panel"
          data-fit-content={fitContent || undefined}
          className={`absolute right-0 top-full z-40 mt-2 flex flex-col max-h-[min(40rem,75dvh,var(--search-viewport-height,100dvh),var(--editor-popup-available-height,calc(100dvh-var(--app-bar-height,4rem)-1rem)))] ${fitContent ? "h-auto" : "h-[min(40rem,75dvh,var(--editor-popup-available-height,calc(100dvh-var(--app-bar-height,4rem)-1rem)))]"} w-[var(--search-panel-width,min(48rem,calc(100vw-2rem)))] overflow-hidden p-0 sm:p-0 shadow-xl group-data-[compact=true]/search-panel:inset-x-4 group-data-[compact=true]/search-panel:w-auto`}
        >
          {children}
        </Card>
      )}
    </div>
  );
}
