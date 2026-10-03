"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A visual edge spring. The parent remains the native scroll owner. */
export function ElasticScrollContent({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const boundary = boundaryRef.current;
    const motion = motionRef.current;
    const owner = boundary?.parentElement;
    if (!enabled || !boundary || !motion || !owner) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let offset = 0;
    let velocity = 0;
    let frame = 0;
    let releaseTimer = 0;
    let touch: { id: number; x: number; y: number; target: EventTarget | null } | null = null;

    function paint() {
      if (!boundary || !motion) return;
      if (offset) {
        boundary.dataset.elasticActive = "true";
        motion.style.transform = `translate3d(0, ${offset}px, 0)`;
      } else {
        delete boundary.dataset.elasticActive;
        motion.style.removeProperty("transform");
      }
    }
    function reset() {
      cancelAnimationFrame(frame);
      clearTimeout(releaseTimer);
      offset = velocity = frame = releaseTimer = 0;
      paint();
    }
    function release() {
      cancelAnimationFrame(frame);
      let last = performance.now();
      function spring(now: number) {
        const elapsed = Math.min((now - last) / 1000, 0.032);
        last = now;
        velocity += (-220 * offset - 26 * velocity) * elapsed;
        offset += velocity * elapsed;
        if (Math.abs(offset) < 0.15 && Math.abs(velocity) < 2) { reset(); return; }
        paint();
        frame = requestAnimationFrame(spring);
      }
      frame = requestAnimationFrame(spring);
    }
    function accepts(target: EventTarget | null) {
      if (!owner || preference.matches || owner.closest("[inert]")) return false;
      if (!/^(auto|scroll)$/.test(getComputedStyle(owner).overflowY)) return false;
      // Nested vertical scrolling, editing, media and local controls keep their own input, even at an edge.
      for (let element = target instanceof Element ? target : null; element && element !== owner; element = element.parentElement) {
        if (element.matches("input, textarea, select, video, iframe, [contenteditable='true'], [role='slider'], [data-elastic-ignore]")) return false;
        const style = getComputedStyle(element);
        if (/^(auto|scroll)$/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) return false;
      }
      return true;
    }
    function pull(delta: number, strength: number) {
      if (!owner) return;
      const max = Math.max(0, owner.scrollHeight - owner.clientHeight);
      const atEdge = delta < 0 ? owner.scrollTop <= 1 : owner.scrollTop >= max - 1;
      if (!atEdge) { reset(); return; }
      cancelAnimationFrame(frame);
      velocity = 0;
      const limit = Math.min(56, owner.clientHeight * 0.12);
      offset = Math.max(-limit, Math.min(limit, offset - delta * strength * (1 - Math.abs(offset) / limit)));
      paint();
    }
    function wheel(event: WheelEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.shiftKey || !event.deltaY
        || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !accepts(event.target)) { reset(); return; }
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? owner!.clientHeight : 1;
      pull(event.deltaY * unit, 0.28);
      clearTimeout(releaseTimer);
      if (offset) releaseTimer = window.setTimeout(release, 90);
    }
    function touchStart(event: TouchEvent) {
      reset();
      const point = event.touches.length === 1 ? event.touches[0] : null;
      touch = point && accepts(event.target) ? { id: point.identifier, x: point.clientX, y: point.clientY, target: event.target } : null;
    }
    function touchMove(event: TouchEvent) {
      if (!touch || event.touches.length !== 1 || event.defaultPrevented) { touch = null; reset(); return; }
      const point = Array.from(event.touches).find((point) => point.identifier === touch!.id);
      if (!point) return;
      const delta = touch.y - point.clientY;
      const horizontal = touch.x - point.clientX;
      touch.x = point.clientX;
      touch.y = point.clientY;
      if (!accepts(touch.target) || Math.abs(horizontal) >= Math.abs(delta)) { reset(); return; }
      pull(delta, 0.5);
    }
    function touchEnd() { touch = null; if (offset) release(); }
    function motionPreference() {
      reset();
      if (preference.matches) delete owner!.dataset.elasticReady;
      else owner!.dataset.elasticReady = "true";
    }
    motionPreference();
    // Passive observation avoids blocking native in-range scrolling, zoom or momentum.
    owner.addEventListener("wheel", wheel, { passive: true });
    owner.addEventListener("touchstart", touchStart, { passive: true });
    owner.addEventListener("touchmove", touchMove, { passive: true });
    owner.addEventListener("touchend", touchEnd, { passive: true });
    owner.addEventListener("touchcancel", touchEnd, { passive: true });
    owner.addEventListener("scroll", reset, { passive: true });
    owner.addEventListener("pointerdown", reset);
    owner.addEventListener("keydown", reset);
    window.addEventListener("resize", reset);
    preference.addEventListener("change", motionPreference);
    return () => {
      reset();
      delete owner.dataset.elasticReady;
      owner.removeEventListener("wheel", wheel);
      owner.removeEventListener("touchstart", touchStart);
      owner.removeEventListener("touchmove", touchMove);
      owner.removeEventListener("touchend", touchEnd);
      owner.removeEventListener("touchcancel", touchEnd);
      owner.removeEventListener("scroll", reset);
      owner.removeEventListener("pointerdown", reset);
      owner.removeEventListener("keydown", reset);
      window.removeEventListener("resize", reset);
      preference.removeEventListener("change", motionPreference);
    };
  }, [enabled, children]);

  return <div ref={boundaryRef} className="elastic-scroll-boundary">
    <div ref={motionRef} className="elastic-scroll-motion">{children}</div>
  </div>;
}
