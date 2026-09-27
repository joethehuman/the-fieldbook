"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Only fade an edge while the scroll area has hidden content beyond it. */
export function useScrollFade<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ before: false, after: false });
  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const before = element.scrollTop > 2;
    const after = element.scrollHeight - element.clientHeight - element.scrollTop > 2;
    setEdges((current) =>
      current.before === before && current.after === after
        ? current
        : { before, after },
    );
  }, []);

  useLayoutEffect(() => {
    if (!active) return;
    const element = ref.current;
    if (!element) return;
    measure();
    const resize = new ResizeObserver(measure);
    const mutation = new MutationObserver(measure);
    resize.observe(element);
    mutation.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [active, measure]);

  return { ref, measure, edges };
}
