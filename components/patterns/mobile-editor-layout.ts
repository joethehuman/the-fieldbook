/** Ordered mobile layout work, scoped to one mounted app shell. */
type Phase = "viewport" | "dock" | "caret" | "overlay";
const phases: Phase[] = ["viewport", "dock", "caret", "overlay"];

export type MobileWritingBand = {
  top: number;
  bottom: number;
  keyboard: boolean;
};

export function createMobileEditorLayout() {
  const subscribers = phases.map(() => new Set<() => void>());
  let request = 0;
  let dirty = phases.length;
  let running = -1;
  const layout = {
    band: null as MobileWritingBand | null,
    schedule(phase: Phase) {
      const index = phases.indexOf(phase);
      // Later phases already run in this paint. Work invalidating the current
      // or an earlier phase is deferred; a subscriber never runs twice per paint.
      if (running >= 0 && index > running) return;
      dirty = Math.min(dirty, index);
      if (!request) request = requestAnimationFrame(flush);
    },
    subscribe(phase: Phase, callback: () => void) {
      const callbacks = subscribers[phases.indexOf(phase)];
      callbacks.add(callback);
      layout.schedule(phase);
      return () => {
        callbacks.delete(callback);
        if (subscribers.every(set => set.size === 0)) {
          cancelAnimationFrame(request);
          request = 0;
          dirty = phases.length;
          layout.band = null;
        }
      };
    },
  };
  function flush() {
    request = 0;
    const first = dirty;
    dirty = phases.length;
    try {
      for (running = first; running < phases.length; running++) {
        for (const callback of subscribers[running]) callback();
      }
    } finally { running = -1; }
  }
  return layout;
}

const layouts = new WeakMap<HTMLElement, ReturnType<typeof createMobileEditorLayout>>();
export function mobileEditorLayout(element: HTMLElement) {
  const shell = element.closest<HTMLElement>(".main-shell") || element;
  let layout = layouts.get(shell);
  if (!layout) { layout = createMobileEditorLayout(); layouts.set(shell, layout); }
  return layout;
}

/** One readiness rule for tap-opened panels and palettes, with a bounded fallback. */
export function mobileEditorOpeningReady(band: MobileWritingBand | null, preferred: number, deadline: number, elapsed = false) {
  return !!band && !band.keyboard && band.bottom - band.top >= preferred
    || elapsed || performance.now() >= deadline;
}
