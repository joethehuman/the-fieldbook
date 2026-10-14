"use client";

import { useLayoutEffect, type RefObject } from "react";
import { touchWritingQuery } from "./use-editor-cards-layout";
import { compactLayoutQuery } from "./use-compact-layout";

/** Identify the intrinsic mobile writing surface; EditorFrame owns focus reveal. */
export function useMobileWritingCanvas(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root?.closest(".editor")) return;
    const compact = matchMedia(compactLayoutQuery);
    const touch = matchMedia(touchWritingQuery);
    const update = () => root.toggleAttribute("data-mobile-canvas", compact.matches && touch.matches);
    update();
    compact.addEventListener("change", update);
    touch.addEventListener("change", update);
    return () => {
      root.removeAttribute("data-mobile-canvas");
      compact.removeEventListener("change", update);
      touch.removeEventListener("change", update);
    };
  }, [ref]);
}
