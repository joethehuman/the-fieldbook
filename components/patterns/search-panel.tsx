"use client";
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Card } from "../ui/card";

/** Stable nonmodal surface; children own scrolling within the available height. */
export function SearchPanel({
  id,
  open,
  compact = false,
  intrinsic = false,
  onDismiss,
  trigger,
  children,
  returnFocus,
  persistentContent,
}: {
  id: string;
  open: boolean;
  compact?: boolean;
  intrinsic?: boolean;
  onDismiss: () => void;
  trigger: ReactNode;
  children: ReactNode;
  /** Session owners that must survive panel dismissal; may portal into the panel. */
  persistentContent?: ReactNode;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !compact || !element) return;
    const shell = element.closest<HTMLElement>(".main-shell");
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bottom = Math.min(shell?.getBoundingClientRect().bottom ?? Infinity,
        (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight));
      // Search owns an overlay rectangle, not the document's caret comfort band.
      const height = `${Math.max(0, bottom - element.getBoundingClientRect().top - 16)}px`;
      if (element.style.getPropertyValue("--search-panel-available-height") !== height) {
        element.style.setProperty("--search-panel-available-height", height);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    const resize = new ResizeObserver(schedule);
    if (shell) resize.observe(shell);
    const header = root.current?.closest<HTMLElement>(".topbar");
    if (header) resize.observe(header);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
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
          (returnFocus?.current || root.current?.querySelector("input"))?.focus({ preventScroll: true });
          onDismiss();
        }
      }}
    >
      {trigger}
      {persistentContent}
      {open && (
        <Card
          ref={panel}
          id={id}
          data-slot="search-panel"
          data-intrinsic={compact && intrinsic || undefined}
          className={`absolute right-0 top-full z-40 mt-2 w-[var(--search-panel-width,min(48rem,calc(100vw-2rem)))] overflow-hidden p-0 sm:p-0 shadow-xl group-data-[compact=true]/search-panel:inset-x-4 group-data-[compact=true]/search-panel:w-auto ${compact
            ? "max-h-[var(--search-panel-available-height,calc(100dvh-var(--app-bar-height,4rem)-1rem))] " + (intrinsic ? "flex h-auto flex-col" : "h-[min(40rem,75dvh,var(--search-panel-available-height,calc(100dvh-var(--app-bar-height,4rem)-1rem)))]")
            : "h-[min(40rem,75dvh,var(--editor-popup-available-height,calc(100dvh-var(--app-bar-height,4rem)-1rem)))]"}`}
        >
          {children}
        </Card>
      )}
    </div>
  );
}
