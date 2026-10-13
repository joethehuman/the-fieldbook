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
  fullHeight: number;
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
    recordViewport(geometry: number[], now: number, fullHeight: number) {
      const signature = geometrySignature(geometry);
      const changed = signature !== layout.viewport?.signature;
      layout.viewport = { geometry, signature, changedAt: changed ? now : layout.viewport!.changedAt, fullHeight };
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

export function createMobileEditorOpening(now: number, viewport?: MobileEditorViewport | null) {
  return {
    startedAt: now, changedAt: viewport?.changedAt ?? now, geometry: null as string | null,
    viewportSignature: viewport?.signature ?? null,
    startedSettled: !!viewport && now - viewport.changedAt >= mobileViewportQuietTime,
    moved: false,
  };
}

/** An opening can outlast its fallback while the native viewport is moving. */
export function mobileEditorOpeningReady(
  opening: ReturnType<typeof createMobileEditorOpening>,
  band: MobileWritingBand | null,
  preferred: number,
  viewportGeometry: readonly number[],
  now: number,
  viewport?: MobileEditorViewport | null,
) {
  const viewportSignature = geometrySignature(viewportGeometry);
  const viewportChanged = opening.viewportSignature !== null && viewportSignature !== opening.viewportSignature;
  opening.moved ||= viewportChanged;
  opening.viewportSignature = viewportSignature;
  const geometry = geometrySignature([...viewportGeometry, band?.top ?? 0, band?.bottom ?? 0, Number(band?.keyboard)]);
  if (geometry !== opening.geometry) {
    if (opening.geometry !== null || viewportChanged || !viewport) opening.changedAt = now;
    opening.geometry = geometry;
  }
  // Several unchanged paints also tolerate delayed native resize events. This
  // is a quiet window after the latest movement, not another opening deadline.
  const changedAt = Math.max(opening.changedAt, viewport?.changedAt ?? 0);
  const settledAt = changedAt + mobileViewportQuietTime;
  const fits = !!band && !band.keyboard && band.bottom - band.top >= preferred;
  const restored = !viewport || viewportGeometry[0] >= viewport.fullHeight - 1;
  const settledBeforeOpening = opening.startedSettled && !opening.moved;
  // A keyboard that stays open must still expose its controls, including when
  // it pans before stopping. Movement restarts its fallback quiet window;
  // a deadline measured only from opening cannot override native animation.
  const fallbackAt = Math.max(opening.startedAt, band?.keyboard && opening.moved ? changedAt : opening.startedAt) + 350;
  const readyAt = Math.max(settledAt,
    fits && (restored || settledBeforeOpening) ? opening.startedAt : fallbackAt);
  return { ready: !!band && now >= readyAt,
    checkIn: band ? Math.max(1, readyAt - now) : mobileViewportQuietTime };
}
