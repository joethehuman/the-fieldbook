"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Card } from "../ui/card";

/** Nonmodal search surface: keep the source page mounted and interactive. */
export function SearchPanel({
  id,
  open,
  onDismiss,
  trigger,
  children,
}: {
  id: string;
  open: boolean;
  onDismiss: () => void;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
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
      className="relative min-w-0 max-[767px]:static"
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
          root.current?.querySelector("input")?.focus();
          onDismiss();
        }
      }}
    >
      {trigger}
      {open && (
        <Card
          id={id}
          data-slot="search-panel"
          className="absolute right-0 top-full z-40 mt-2 max-h-[min(36rem,65dvh,calc(100dvh-var(--app-bar-height,4rem)-1rem))] w-[var(--search-panel-width,min(48rem,calc(100vw-2rem)))] overflow-y-auto overscroll-contain p-0 sm:p-0 shadow-xl max-[767px]:inset-x-4 max-[767px]:w-auto"
        >
          {children}
        </Card>
      )}
    </div>
  );
}
