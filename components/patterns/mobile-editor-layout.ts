/** Ordered mobile layout work, scoped to one mounted app shell. */
type Phase = "viewport" | "dock" | "caret" | "overlay";
const phases: Phase[] = ["viewport", "dock", "caret", "overlay"];

export type MobileWritingBand = {
  top: number;
  bottom: number;
  keyboard: boolean;
};

export type MobileEditorViewport = {
  geometry: readonly number[];
  signature: string;
  changedAt: number;
};
export const mobileViewportQuietTime = 96;
const geometrySignature = (geometry: readonly number[]) => geometry.map(Math.round).join(":");

export function createMobileEditorLayout() {
  const subscribers = phases.map(() => new Set<() => void>());
  let request = 0;
  let dirty = phases.length;
  let running = -1;
  const layout = {
    band: null as MobileWritingBand | null,
    viewport: null as MobileEditorViewport | null,
    recordViewport(geometry: number[], now: number) {
      const signature = geometrySignature(geometry);
      const changed = signature !== layout.viewport?.signature;
      layout.viewport = { geometry, signature, changedAt: changed ? now : layout.viewport!.changedAt };
      return changed;
    },
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
          layout.viewport = null;
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
