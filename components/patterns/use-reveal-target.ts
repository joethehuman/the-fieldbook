"use client";

import { useEffect, useRef, useState } from "react";

/** Request from an explicit navigation action, after accepting any leave guard. */
export function useRevealTarget<T extends HTMLElement = HTMLDivElement>({
  context = false,
  scrollContainer,
  block = "start",
  scroll = true,
}: {
  context?: boolean;
  scrollContainer?: string;
  block?: "start" | "nearest";
  /** Sticky feedback is already visible and only needs focus. */
  scroll?: boolean;
} = {}) {
  const ref = useRef<T>(null);
  const [request, setRequest] = useState<{ focus: boolean } | null>(null);
  useEffect(() => {
    if (!request) return;
    // Wait for the destination to mount and for overlay focus restoration to finish.
    const frame = requestAnimationFrame(() => {
      const target = ref.current;
      if (!target) return;
      if (request.focus) target.focus({ preventScroll: true });
      if (!scroll) return;
      const scrollTarget = context
        ? target.closest<HTMLElement>("[data-reveal-context]") || target
        : target;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? "instant"
        : "smooth";
      if (scrollContainer) {
        // Reveal inside the owning pane without scrolling the page behind it.
        const area = scrollTarget.closest<HTMLElement>(scrollContainer);
        if (!area) return;
        const visible = area.getBoundingClientRect();
        const bounds = scrollTarget.getBoundingClientRect();
        const top =
          block === "start" || bounds.height > area.clientHeight
            ? bounds.top - visible.top
            : bounds.bottom > visible.bottom
              ? bounds.bottom - visible.bottom
              : bounds.top < visible.top
                ? bounds.top - visible.top
                : 0;
        if (top) area.scrollBy({ top, behavior });
      } else {
        scrollTarget.scrollIntoView({ block, behavior });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [request, context, scrollContainer, block, scroll]);
  return {
    targetProps: { ref, tabIndex: -1, "data-reveal-target": true as const },
    reveal: (focus = true) => setRequest({ focus }),
  };
}
