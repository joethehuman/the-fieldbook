"use client";

import { useEffect, useRef, useState } from "react";

/** Request from an explicit navigation action, after accepting any leave guard. */
export function useRevealTarget<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [request, setRequest] = useState<{ focus: boolean } | null>(null);
  useEffect(() => {
    if (!request) return;
    // Wait for the destination to mount and for overlay focus restoration to finish.
    const frame = requestAnimationFrame(() => {
      const target = ref.current;
      if (!target) return;
      if (request.focus) target.focus({ preventScroll: true });
      target.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [request]);
  return {
    targetProps: { ref, tabIndex: -1, "data-reveal-target": true as const },
    reveal: (focus = true) => setRequest({ focus }),
  };
}
