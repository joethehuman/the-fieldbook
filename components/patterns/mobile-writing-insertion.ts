type CaretRect = Pick<DOMRect, "top" | "bottom" | "height">;
const pendingInsertions = new WeakMap<HTMLElement, () => void>();

/** Client coordinates for ordinary editables, not fixed-position overlays. */
function writingBand(frame: HTMLElement) {
  const viewport = window.visualViewport;
  const top = CSS.supports("-webkit-backdrop-filter", "none") ? 0 : viewport?.offsetTop || 0;
  const toolbar = frame.querySelector(".editor-mobile-toolbar")?.getBoundingClientRect();
  const margin = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 12;
  return { top: Math.max(top, toolbar?.bottom || 0) + margin,
    bottom: top + (viewport?.height ?? innerHeight) - margin };
}

function nativeCaret(surface: HTMLElement): CaretRect | null {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount || !surface.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getClientRects()[0];
  if (rect?.height) return rect;
  const node = selection.focusNode;
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  // A newly inserted empty paragraph/cell has no text range to measure.
  return element?.closest("p, li, h1, h2, h3, h4, h5, h6")?.getBoundingClientRect() || null;
}

/** Explicit insertion only: never refocus, reset selection, or track everyday typing. */
export function revealMobileWritingInsertion(scope: HTMLElement | null, {
  target = () => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.isContentEditable && scope?.contains(active) ? active : null;
  },
  readCaret = nativeCaret,
  reveal,
}: {
  target?: () => HTMLElement | null;
  readCaret?: (surface: HTMLElement) => CaretRect | null;
  reveal?: () => void;
} = {}) {
  const frame = scope?.closest<HTMLElement>('.editor-frame[data-mobile]');
  if (!scope || !frame) return () => {};
  pendingInsertions.get(frame)?.();
  const viewport = window.visualViewport;
  let request = 0;
  let focused: HTMLElement | null = null;
  let cancelled = false;
  let nativeFallback = false;
  const initialHeight = viewport?.height ?? innerHeight;
  let keyboardShrank = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    cancelAnimationFrame(request);
    clearTimeout(expiry);
    observer.disconnect();
    document.removeEventListener("pointerdown", cancel, true);
    document.removeEventListener("touchmove", cancel, true);
    document.removeEventListener("wheel", cancel, true);
    document.removeEventListener("focusin", onFocus, true);
    document.removeEventListener("selectionchange", onSelection);
    document.removeEventListener("beforeinput", cancel, true);
    document.removeEventListener("keydown", onKey, true);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    if (pendingInsertions.get(frame) === cancel) pendingInsertions.delete(frame);
  };
  const measure = () => {
    request = 0;
    if (!scope.isConnected || !frame.hasAttribute("data-mobile")) { cancel(); return; }
    const surface = target();
    if (!surface || document.activeElement !== surface) {
      if (focused) cancel();
      return;
    }
    focused = surface;
    if (!keyboardShrank && (viewport?.height ?? innerHeight) < initialHeight - 1) {
      keyboardShrank = true;
      // At most one native fallback before opening and one after it starts.
      // Repeated geometry reports must not rearm a native-panning loop.
      nativeFallback = false;
    }
    const caret = readCaret(surface);
    if (!caret?.height) return;
    const band = writingBand(frame);
    if (caret.height > band.bottom - band.top) return;
    const delta = caret.top < band.top ? caret.top - band.top
      : caret.bottom > band.bottom ? caret.bottom - band.bottom : 0;
    if (Math.abs(delta) < 1) return;
    if (reveal) {
      // CodeMirror owns its internal scrollport and the outer document walk.
      reveal();
    } else window.scrollBy({ top: delta, behavior: "instant" });
    // One follow-up measurement after the library's queued layout pass. A
    // clamped short document can still need native visual-viewport panning.
    request = requestAnimationFrame(() => {
      request = 0;
      if (cancelled || document.activeElement !== surface) return;
      const next = readCaret(surface);
      const visible = writingBand(frame);
      // A resize can arrive while this layout follow-up is already queued.
      // Re-evaluate against the new band instead of dropping that notification.
      if (visible.top !== band.top || visible.bottom !== band.bottom) { schedule(); return; }
      if (next && (next.top < visible.top - 1 || next.bottom > visible.bottom + 1) && !nativeFallback) {
        nativeFallback = true;
        const selection = window.getSelection();
        const node = selection?.focusNode;
        const line = node instanceof HTMLElement ? node : node?.parentElement;
        (line && surface.contains(line) ? line.closest(".cm-line, p, li, h1, h2, h3, h4, h5, h6") || surface : surface)
          .scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      }
    });
  };
  function schedule() {
    if (!cancelled && !request) request = requestAnimationFrame(measure);
  }
  function onFocus(event: FocusEvent) {
    if (focused && event.target !== focused) cancel();
    else schedule();
  }
  function onSelection() {
    // A native selection gesture takes ownership; do not restore its bookmark.
    if (focused && (!window.getSelection()?.isCollapsed || !focused.contains(window.getSelection()?.focusNode || null))) cancel();
  }
  function onKey(event: KeyboardEvent) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Escape"].includes(event.key)) cancel();
  }
  const observer = new MutationObserver(schedule);
  observer.observe(scope, { childList: true, subtree: true });
  // This is a cleanup deadline, not a delayed scrolling instruction. Keep the
  // request alive through late iOS keyboard geometry without a permanent loop.
  const expiry = window.setTimeout(cancel, 1500);
  pendingInsertions.set(frame, cancel);
  document.addEventListener("pointerdown", cancel, { capture: true, passive: true });
  document.addEventListener("touchmove", cancel, { capture: true, passive: true });
  document.addEventListener("wheel", cancel, { capture: true, passive: true });
  document.addEventListener("focusin", onFocus, true);
  document.addEventListener("selectionchange", onSelection);
  document.addEventListener("beforeinput", cancel, true);
  document.addEventListener("keydown", onKey, true);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  schedule();
  return cancel;
}
