"use client";

import { useLayoutEffect, useRef } from "react";

/** Keep a list's place while its owning view shows a record detail. */
export function useListReturn(detailId: string) {
  const ref = useRef<HTMLElement>(null);
  const currentDetail = useRef(detailId);
  currentDetail.current = detailId;
  const previousDetail = useRef(detailId);
  const positions = useRef(
    new Map<HTMLElement, { top: number; left: number }>(),
  );

  function rememberList() {
    if (currentDetail.current || !ref.current) return;
    positions.current.clear();
    for (
      let element: HTMLElement | null = ref.current;
      element;
      element = element.parentElement
    )
      positions.current.set(element, {
        top: element.scrollTop,
        left: element.scrollLeft,
      });
    for (const element of ref.current.querySelectorAll<HTMLElement>("*")) {
      if (element.scrollTop || element.scrollLeft)
        positions.current.set(element, {
          top: element.scrollTop,
          left: element.scrollLeft,
        });
    }
  }

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    rememberList();
    const ancestors: HTMLElement[] = [];
    for (
      let element: HTMLElement | null = root;
      element;
      element = element.parentElement
    )
      ancestors.push(element);
    const rememberScroll = (event: Event) => {
      if (currentDetail.current) return;
      const element =
        event.target === document ? document.scrollingElement : event.target;
      if (element instanceof HTMLElement)
        positions.current.set(element, {
          top: element.scrollTop,
          left: element.scrollLeft,
        });
    };
    // Capture nested chart scrolling as well as the page's owning scroll pane.
    root.addEventListener("scroll", rememberScroll, {
      capture: true,
      passive: true,
    });
    for (const element of ancestors.slice(1))
      element.addEventListener("scroll", rememberScroll, { passive: true });
    document.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", rememberScroll, true);
      for (const element of ancestors.slice(1))
        element.removeEventListener("scroll", rememberScroll);
      document.removeEventListener("scroll", rememberScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (previousDetail.current === detailId) return;
    previousDetail.current = detailId;
    const heading = Array.from(
      ref.current?.querySelectorAll<HTMLElement>("h2") || [],
    ).find((element) => element.getClientRects().length > 0);
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    if (detailId || !positions.current.size)
      heading?.scrollIntoView({ block: "start", behavior: "instant" });
    else {
      for (const [element, position] of positions.current) {
        if (element.isConnected)
          element.scrollTo({
            top: position.top,
            left: position.left,
            behavior: "instant",
          });
      }
    }
  }, [detailId]);

  return { ref, rememberList };
}
