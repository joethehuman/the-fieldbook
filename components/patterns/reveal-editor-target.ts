"use client";

const activeReveals = new WeakMap<HTMLElement, () => void>();

/** Reveal one field within its owning scroll area, then an offscreen stacked panel if needed. */
export function revealEditorTarget(target: HTMLElement, {
  container = target.closest<HTMLElement>('.writing-scroll-area, .editor-frame-details, .editor-frame-outline, .editor-frame-canvas, [data-slot="scroll-region"]')
    || target.closest<HTMLElement>(".main-content"),
  context = target.closest<HTMLElement>('[data-slot="field"]') || target,
  focus = true,
  highlight = false,
}: { container?: HTMLElement | null; context?: HTMLElement; focus?: boolean; highlight?: boolean } = {}) {
  // Canvas title attention is explicit; ordinary clicks and keyboard focus stay quiet.
  if (focus && highlight && target.matches(".document-title")) target.dataset.revealFocus = "true";
  const owner = target.closest<HTMLElement>(".main-content") || container;
  const bounded = !!target.closest('.editor[data-scroll-layout="workspace"], .editor-floating-body, [data-slot="dialog-content"]');
  // Stacked panels and the natural writing body belong to the page. A native
  // Markdown textarea can still own its text scrolling in the page layout.
  if (!bounded && !container?.matches("textarea")) container = owner;
  if (!container || !owner) { if (focus) target.focus({ preventScroll: true }); return () => {}; }
  activeReveals.get(container)?.();
  if (focus) {
    target.focus({ preventScroll: true });
    if (target.isContentEditable) {
      // A caret at the editor root looks like the first line, but slash commands
      // need a selection inside a writing block. Skip non-editable decorations.
      const firstBlock = Array.from(target.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6, blockquote, li"))
        .find((block) => block.isContentEditable);
      const range = document.createRange();
      range.selectNodeContents(firstBlock || target);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else if (target.matches('textarea[aria-label$=" Markdown"]') && target instanceof HTMLTextAreaElement) {
      target.setSelectionRange(0, 0);
    }
  }
  const writing = container.matches(".writing-scroll-area");
  const canvasScroll = container.matches(".editor-frame-canvas") && bounded;
  const local = writing || canvasScroll || container.matches('.editor-frame-details, .editor-frame-outline, [data-slot="scroll-region"]');
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const gap = rem * 1.5;
  const start = container.scrollTop;
  let frame = 0;
  let cancelled = false;
  let cancelParent: (() => void) | undefined;
  const cancel = () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    cancelParent?.();
    container.removeEventListener("wheel", cancel);
    container.removeEventListener("touchstart", cancel);
    container.removeEventListener("keydown", cancel);
    owner.removeEventListener("pointerdown", cancel);
    if (activeReveals.get(container) === cancel) activeReveals.delete(container);
  };
  activeReveals.set(container, cancel);
  container.addEventListener("wheel", cancel, { passive: true });
  container.addEventListener("touchstart", cancel, { passive: true });
  container.addEventListener("keydown", cancel);
  owner.addEventListener("pointerdown", cancel, { passive: true });

  const geometry = () => {
    if (writing && target === container) return { visible: container.scrollTop <= 1, destination: 0 };
    const viewport = container.getBoundingClientRect();
    const style = getComputedStyle(target);
    const header = parseFloat(style.getPropertyValue("--editor-header-height")) || 0;
    const controls = parseFloat(style.getPropertyValue("--editor-controls-height")) || 0;
    const toolbar = target.closest(".writing-surface")?.querySelector<HTMLElement>(".mdxeditor-toolbar, .writing-view-header")?.getBoundingClientRect().height || 0;
    const inCanvas = !!target.closest(".editor-frame-canvas");
    const inControls = !!target.closest(".editor-frame-controls");
    const inToolbar = !!target.closest(".mdxeditor-toolbar, .writing-view-header");
    const inPanel = !!target.closest(".editor-frame-details, .editor-frame-outline");
    const wholeSurface = target.matches(".writing-surface");
    const canvas = target.closest<HTMLElement>(".editor-frame-canvas");
    const surfaceTop = canvas ? parseFloat(getComputedStyle(canvas).top) : NaN;
    const navigation = parseFloat(style.getPropertyValue("--editor-navigation-height")) || 0;
    const heading = target.closest(".writing-surface, .course-quiz-canvas")?.querySelector<HTMLElement>(".writing-document-heading");
    const inHeading = !!heading?.contains(target);
    const pinnedHeading = heading && !inHeading && !target.closest(".writing-course-heading") ? heading.getBoundingClientRect().height : 0;
    const inset = local ? canvasScroll ? navigation + pinnedHeading : inHeading ? toolbar : toolbar + pinnedHeading : wholeSurface && Number.isFinite(surfaceTop) ? surfaceTop
      : header + (inControls ? 0 : inCanvas || inPanel ? controls + navigation + (inToolbar ? 0 : toolbar + pinnedHeading) : 0);
    let top = viewport.top + container.clientTop + inset;
    let bottom = viewport.top + container.clientTop + container.clientHeight;
    if (local && owner !== container) {
      const parent = owner.getBoundingClientRect();
      const visibleTop = Math.max(top, parent.top + owner.clientTop + header + controls);
      const visibleBottom = Math.min(bottom, parent.top + owner.clientTop + owner.clientHeight);
      // An offscreen stacked panel first reveals the control locally, then its parent.
      if (visibleBottom > visibleTop) { top = visibleTop; bottom = visibleBottom; }
    }
    const padding = inControls || inToolbar || wholeSurface ? 0 : gap;
    top += padding;
    bottom -= wholeSurface ? parseFloat(getComputedStyle(container).paddingBottom) || 0 : padding;
    const available = Math.max(0, bottom - top);
    const field = context.getBoundingClientRect();
    const control = target.getBoundingClientRect();
    const writingBody = target.matches('[contenteditable], textarea[aria-label$=" Markdown"]');
    let fieldTop = Math.min(field.top, control.top);
    let fieldBottom = Math.max(field.bottom, control.bottom);
    if (writingBody) {
      // Long writing surfaces reveal their first line, not the middle of the whole body.
      fieldTop = control.top + (parseFloat(style.paddingTop) || 0);
      fieldBottom = fieldTop + Math.min(control.height, available * 0.65);
    } else if (!focus && target === context && fieldBottom - fieldTop > available) {
      // A multi-field section reveals its heading and first controls without selecting one.
      fieldBottom = fieldTop + available;
    } else if (fieldBottom - fieldTop > available) {
      const label = target.closest<HTMLElement>('[data-slot="field"]')?.getBoundingClientRect();
      fieldTop = Math.max(Math.min(label?.top ?? control.top, control.top), control.bottom - available);
      fieldBottom = control.bottom;
    }
    const height = fieldBottom - fieldTop;
    const destination = container.scrollTop + fieldTop - top - Math.max(0, (available - height) * 0.28);
    return {
      visible: fieldTop >= top && fieldBottom <= bottom,
      destination: Math.max(0, Math.min(container.scrollHeight - container.clientHeight, destination)),
    };
  };

  const finish = () => {
    cancel();
    if (!target.isConnected || !local || canvasScroll || owner === container || (!writing && getComputedStyle(container).position !== "static")) return;
    const surface = writing ? container.closest<HTMLElement>(".writing-surface") : null;
    const parentTarget = surface && getComputedStyle(surface).maxHeight !== "none" ? surface : target;
    if (!parentTarget) return;
    const parent = owner.getBoundingClientRect();
    const control = parentTarget.getBoundingClientRect();
    const style = getComputedStyle(target);
    const inset = (parseFloat(style.getPropertyValue("--editor-header-height")) || 0)
      + (parseFloat(style.getPropertyValue("--editor-controls-height")) || 0);
    const canvas = parentTarget.closest<HTMLElement>(".editor-frame-canvas");
    const surfaceTop = canvas ? parseFloat(getComputedStyle(canvas).top) : NaN;
    const topClearance = writing && Number.isFinite(surfaceTop) ? surfaceTop : inset + gap;
    const bottomClearance = writing ? parseFloat(getComputedStyle(owner).paddingBottom) || 0 : gap;
    if (control.top < parent.top + owner.clientTop + topClearance - 1
      || control.bottom > parent.top + owner.clientTop + owner.clientHeight - bottomClearance + 1) {
      cancelParent = revealEditorTarget(parentTarget, { container: owner, context: writing ? parentTarget : context, focus: false });
    }
  };

  frame = requestAnimationFrame(() => {
    if (!target.isConnected || !container.isConnected) { cancel(); return; }
    if (container.scrollHeight <= container.clientHeight + 1 || geometry().visible) { finish(); return; }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      container.scrollTo({ top: geometry().destination, behavior: "instant" });
      finish();
      return;
    }
    const started = performance.now();
    const animate: FrameRequestCallback = (now) => {
      if (cancelled || !target.isConnected || !container.isConnected) { cancel(); return; }
      const progress = Math.min(1, (now - started) / 340);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      // Re-measure while a newly opened panel wraps and settles into its width.
      const destination = geometry().destination;
      container.scrollTo({ top: start + (destination - start) * eased, behavior: "instant" });
      if (progress < 1) frame = requestAnimationFrame(animate);
      else finish();
    };
    frame = requestAnimationFrame(animate);
  });
  return cancel;
}
