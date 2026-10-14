import { touchWritingQuery } from "./use-editor-cards-layout";

type CaretLine = Pick<DOMRect, "top" | "bottom" | "height">;

/** Desktop comfort belongs to the existing canvas owner, never the document. */
function desktopWritingOwner(surface: HTMLElement) {
  if (window.matchMedia(touchWritingQuery).matches) return null;
  const editor = surface.closest<HTMLElement>(".editor");
  const frame = surface.closest(".editor-frame");
  if (!editor || !frame || frame.hasAttribute("data-mobile") || editor.closest(".app[data-mobile-editor]")) return null;
  const owner = editor.dataset.scrollLayout === "workspace"
    ? surface.closest<HTMLElement>(".writing-viewport")
    : editor.closest<HTMLElement>(".main-content");
  return owner;
}

function writingBand(surface: HTMLElement, caretHeight: number) {
  const owner = desktopWritingOwner(surface);
  if (!owner) return null;
  const frame = surface.closest(".editor-frame")!;
  const bounds = owner.getBoundingClientRect();
  const heading = surface.closest(".writing-root")?.querySelector(".writing-document-heading")?.getBoundingClientRect();
  const navigation = frame.querySelector(".editor-canvas-navigation")?.getBoundingClientRect();
  const top = Math.max(bounds.top + owner.clientTop, heading?.bottom || 0, navigation?.bottom || 0);
  const bottom = Math.min(bounds.top + owner.clientTop + owner.clientHeight, window.innerHeight);
  const usable = bottom - top;
  if (usable <= 0) return null;
  // A few lines of breathing room, rather than a percentage of the window.
  const margin = Math.max(0, Math.min(72, usable / 3, usable - caretHeight));
  return { owner, top, bottom: bottom - margin };
}

/** Read the native caret, including a new empty paragraph, without changing it. */
export function readDesktopWritingCaret(surface: HTMLElement): CaretLine | null {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount || !surface.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getClientRects()[0];
  if (rect?.height) return rect;
  const node = selection.focusNode;
  if (node instanceof Text && node.length) {
    const offset = Math.min(selection.focusOffset, node.length);
    const character = document.createRange();
    character.setStart(node, offset ? offset - 1 : 0);
    character.setEnd(node, offset || 1);
    return character.getClientRects()[0] || null;
  }
  const element = node instanceof Element ? node : node?.parentElement;
  const line = element?.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote");
  return line && !line.textContent?.trim() ? line.getBoundingClientRect() : null;
}

/** One placement after an editing commit; scroll events never schedule another. */
export function createDesktopWritingScroll(surface: HTMLElement, readCaret: () => CaretLine | null) {
  // Touch-only editors install no listeners, schedule no work, and write no tags.
  if (!desktopWritingOwner(surface)) return null;
  let request = 0;
  function cancel() {
    cancelAnimationFrame(request);
    request = 0;
  }
  function active() {
    return surface.isConnected && surface.contains(document.activeElement) && !!desktopWritingOwner(surface);
  }
  function schedule() {
    if (request || !active()) return;
    request = requestAnimationFrame(() => {
      request = 0;
      if (!active()) return;
      const caret = readCaret();
      const band = caret && writingBand(surface, caret.height);
      if (!caret?.height || !band || caret.height > band.bottom - band.top) return;
      const delta = caret.bottom > band.bottom ? caret.bottom - band.bottom
        : caret.top < band.top ? caret.top - band.top : 0;
      const next = Math.max(0, Math.min(band.owner.scrollHeight - band.owner.clientHeight, band.owner.scrollTop + delta));
      if (Math.abs(next - band.owner.scrollTop) >= 1) band.owner.scrollTop = next;
    });
  }
  const canvas = surface.closest(".editor-frame-canvas")!;
  canvas.addEventListener("pointerdown", cancel, { passive: true });
  canvas.addEventListener("wheel", cancel, { passive: true });
  return {
    active,
    schedule,
    destroy() {
      cancel();
      canvas.removeEventListener("pointerdown", cancel);
      canvas.removeEventListener("wheel", cancel);
    },
  };
}
