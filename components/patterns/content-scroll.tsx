"use client";

import { useEffect, useRef, type ReactNode } from "react";

const MAX_PULL = 56;
const SETTLE_MS = 360;

function childCanScroll(
  target: EventTarget | null,
  boundary: HTMLElement,
  direction: number,
) {
  let node = target instanceof Element ? target : null;
  while (node && node !== boundary) {
    if (node instanceof HTMLElement) {
      const overflow = getComputedStyle(node).overflowY;
      if (
        (overflow === "auto" || overflow === "scroll") &&
        node.scrollHeight > node.clientHeight + 1 &&
        (direction > 0
          ? node.scrollTop + node.clientHeight < node.scrollHeight - 1
          : node.scrollTop > 1)
      ) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

export function ContentScroll({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = scrollRef.current;
    if (!area) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let pull = 0;
    let lastTouchY: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const setPull = (next: number) => {
      clearTimer();
      pull = Math.max(-MAX_PULL, Math.min(MAX_PULL, next));
      area.classList.remove("is-overscroll-releasing");
      area.classList.toggle("is-overscrolling", pull !== 0);
      area.style.setProperty("--content-overscroll", `${pull}px`);
    };
    const release = () => {
      clearTimer();
      if (pull === 0) return;
      pull = 0;
      area.classList.remove("is-overscrolling");
      area.classList.add("is-overscroll-releasing");
      area.style.setProperty("--content-overscroll", "0px");
      timer = setTimeout(() => {
        area.classList.remove("is-overscroll-releasing");
        timer = undefined;
      }, SETTLE_MS);
    };
    const tryPull = (
      movement: number,
      target: EventTarget | null,
      event: WheelEvent | TouchEvent,
    ) => {
      if (reducedMotion.matches || movement === 0 || !event.cancelable) return;
      const atTop = area.scrollTop <= 1;
      const atBottom =
        area.scrollTop + area.clientHeight >= area.scrollHeight - 1;
      if ((pull > 0 && !atTop) || (pull < 0 && !atBottom)) setPull(0);
      const direction = -Math.sign(movement);
      if (pull === 0) {
        if ((movement > 0 && !atTop) || (movement < 0 && !atBottom)) return;
        if (childCanScroll(target, area, direction)) return;
      }

      event.preventDefault();
      const resistance =
        Math.sign(movement) === Math.sign(pull)
          ? 1 - Math.abs(pull) / MAX_PULL
          : 1;
      const next = pull + movement * resistance;
      if (pull !== 0 && Math.sign(next) !== Math.sign(pull)) {
        setPull(0);
        return;
      }
      setPull(next);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
        return;
      const pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? area.clientHeight
            : 1);
      tryPull(-pixels * 0.22, event.target, event);
      if (pull !== 0) {
        clearTimer();
        timer = setTimeout(release, 120);
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
      clearTimer();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (lastTouchY === null || event.touches.length !== 1) return;
      const nextY = event.touches[0].clientY;
      tryPull((nextY - lastTouchY) * 0.65, event.target, event);
      lastTouchY = nextY;
    };
    const onTouchEnd = (event: TouchEvent) => {
      lastTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
      if (lastTouchY === null) release();
    };

    area.addEventListener("wheel", onWheel, { passive: false });
    area.addEventListener("touchstart", onTouchStart, { passive: true });
    area.addEventListener("touchmove", onTouchMove, { passive: false });
    area.addEventListener("touchend", onTouchEnd);
    area.addEventListener("touchcancel", onTouchEnd);
    area.addEventListener("scroll", release, { passive: true });
    return () => {
      clearTimer();
      area.removeEventListener("wheel", onWheel);
      area.removeEventListener("touchstart", onTouchStart);
      area.removeEventListener("touchmove", onTouchMove);
      area.removeEventListener("touchend", onTouchEnd);
      area.removeEventListener("touchcancel", onTouchEnd);
      area.removeEventListener("scroll", release);
      area.classList.remove("is-overscrolling", "is-overscroll-releasing");
      area.style.removeProperty("--content-overscroll");
    };
  }, []);

  return (
    <div id="main-content" className="app-scroll" tabIndex={-1} ref={scrollRef}>
      {children}
    </div>
  );
}
