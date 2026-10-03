"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "../ui/button";

export const EditorFocusContext = createContext<{
  active: boolean;
  toggle: () => void;
  status: string;
} | null>(null);

/** Resize the existing editor in place; never move or remount its document. */
export function useEditorFocus(ref: RefObject<HTMLFormElement | null>) {
  const [active, setActive] = useState(false);
  const pending = useRef<
    { scroller: HTMLElement; top: number; left: number }[]
  >([]);
  const outerScroll = useRef(0);
  const previousBounds = useRef<DOMRect | null>(null);
  const motion = useRef<Animation | null>(null);
  const contentMotion = useRef<Animation[]>([]);
  const previousInsets = useRef<{ element: HTMLElement; left: string; right: string }[]>([]);
  const chromeMotion = useRef<Animation[]>([]);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitioning = useRef(false);
  const queuedToggle = useRef(false);
  const latestToggle = useRef(() => {});
  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    chromeMotion.current.forEach(animation => animation.cancel());
  }, []);
  function chrome() {
    return Array.from(ref.current?.querySelectorAll<HTMLElement>(
      ".editor-heading, .editor-introduction, .editor-frame-controls, .editor-frame-panel[data-open=true] > aside",
    ) || []).filter(element => element.getBoundingClientRect().height > 0);
  }
  function offset(element: HTMLElement) {
    if (element.classList.contains("editor-frame-outline")) return "translateX(-16px)";
    if (element.classList.contains("editor-frame-details")) return "translateX(16px)";
    return "translateY(-8px)";
  }
  function toggle() {
    if (transitioning.current) { queuedToggle.current = !queuedToggle.current; return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    transitioning.current = !reduced;
    if (!reduced && ref.current) ref.current.dataset.focusTransition = "true";
    const surface = ref.current?.querySelector<HTMLElement>(".writing-surface");
    previousBounds.current = surface?.getBoundingClientRect() || null;
    previousInsets.current = Array.from(surface?.querySelectorAll<HTMLElement>(
      ".writing-document-heading, .writing-content[contenteditable], .writing-source",
    ) || []).map(element => {
      const style = getComputedStyle(element);
      return { element, left: style.paddingLeft, right: style.paddingRight };
    });
    motion.current?.cancel();
    const viewport = ref.current?.closest<HTMLElement>(".main-content");
    if (!active) outerScroll.current = viewport?.scrollTop || 0;
    pending.current = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(".writing-scroll-area") || [],
    ).map((scroller) => ({
      scroller,
      top: scroller.scrollTop,
      left: scroller.scrollLeft,
    }));
    if (!active && !reduced) {
      // Close the surrounding controls before expanding the still-mounted canvas.
      chromeMotion.current = chrome().map(element => element.animate([
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: offset(element) },
      ], { duration: 120, easing: "ease-out", fill: "forwards" }));
      transitionTimer.current = setTimeout(() => setActive(true), 120);
    } else setActive(value => !value);
  }
  latestToggle.current = toggle;
  useLayoutEffect(() => {
    const surface = ref.current?.querySelector<HTMLElement>(".writing-surface");
    const before = previousBounds.current;
    chromeMotion.current.forEach(animation => animation.cancel());
    chromeMotion.current = [];
    previousBounds.current = null;
    if (surface && before && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (!active) {
        // Keep restored panels and their tabs quiet until the canvas is nearly home.
        chromeMotion.current = chrome().map(element => element.animate([
          { opacity: 0, transform: offset(element) },
          { opacity: 1, transform: "translateY(0)" },
        ], { delay: 180, duration: 120, easing: "ease-out", fill: "both" }));
      }
      transitionTimer.current = setTimeout(() => {
        chromeMotion.current.forEach(animation => animation.cancel());
        chromeMotion.current = [];
        transitioning.current = false;
        if (ref.current) delete ref.current.dataset.focusTransition;
        if (queuedToggle.current) { queuedToggle.current = false; latestToggle.current(); }
      }, active ? 260 : 300);
      const after = surface.getBoundingClientRect();
      if (after.width && after.height) {
        const timing = { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
        // Animate real dimensions: text, title wrapping and media use the same
        // changing width as the canvas instead of scaling an already-reflowed page.
        const insets = previousInsets.current.map(({ element, left, right }) => {
          const style = getComputedStyle(element);
          return { element, left, right, nextLeft: style.paddingLeft, nextRight: style.paddingRight };
        });
        motion.current = surface.animate([
          { width: `${before.width}px`, height: `${before.height}px`, flex: "0 0 auto", maxWidth: "none", transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
          { width: `${after.width}px`, height: `${after.height}px`, flex: "0 0 auto", maxWidth: "none", transform: "translate(0, 0)" },
        ], timing);
        contentMotion.current = insets.map(({ element, left, right, nextLeft, nextRight }) => element.animate([
          { paddingLeft: left, paddingRight: right },
          { paddingLeft: nextLeft, paddingRight: nextRight },
        ], timing));
      }
    }
    // Let the workspace measurement settle before restoring each scroll owner.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        for (const { scroller, top, left } of pending.current) {
          scroller.scrollTop = top;
          scroller.scrollLeft = left;
        }
        const viewport = ref.current?.closest<HTMLElement>(".main-content");
        if (viewport) viewport.scrollTop = active ? 0 : outerScroll.current;
        pending.current = [];
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      motion.current?.cancel();
      contentMotion.current.forEach(animation => animation.cancel());
    };
  }, [active, ref]);
  return { active, toggle };
}

export function EditorFocusControls() {
  const focus = useContext(EditorFocusContext);
  if (!focus) return null;
  return (
    <>
      {focus.active && (
        <span
          className="writing-focus-status text-xs text-muted-foreground"
          role="status"
        >
          {focus.status}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={focus.active}
        aria-label={focus.active ? "Exit focus mode" : "Focus mode"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={focus.toggle}
      >
        {focus.active ? (
          <Minimize2 aria-hidden="true" />
        ) : (
          <Maximize2 aria-hidden="true" />
        )}
        <span>{focus.active ? "Exit focus" : "Focus mode"}</span>
      </Button>
    </>
  );
}
