"use client";

const activeReveals = new WeakMap<HTMLElement, () => void>();

/** Reveal one field within its owning scroll area, then an offscreen stacked panel if needed. */
export function revealEditorTarget(target: HTMLElement, {
  container = target.closest<HTMLElement>(".writing-scroll-area, .editor-frame-details, .editor-frame-outline")
    || target.closest<HTMLElement>(".admin-panel, .main-content"),
  context = target.closest<HTMLElement>('[data-slot="field"]') || target,
  focus = true,
}: { container?: HTMLElement | null; context?: HTMLElement; focus?: boolean } = {}) {
  const owner = target.closest<HTMLElement>(".admin-panel, .main-content") || container;
  if (!container || !owner) { if (focus) target.focus({ preventScroll: true }); return () => {}; }
  activeReveals.get(container)?.();
  if (focus) target.focus({ preventScroll: true });
  const writing = container.matches(".writing-scroll-area");
  const local = writing || container.matches(".editor-frame-details, .editor-frame-outline");
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
    const pageWriting = target.closest<HTMLElement>(".editor-frame")?.dataset.writingScroll === "page";
    const header = pageWriting ? 0 : parseFloat(style.getPropertyValue("--editor-header-height")) || 0;
    const controls = pageWriting ? 0 : parseFloat(style.getPropertyValue("--editor-controls-height")) || 0;
    const toolbar = pageWriting ? 0 : target.closest(".writing-surface")?.querySelector<HTMLElement>(".mdxeditor-toolbar, .writing-view-header")?.getBoundingClientRect().height || 0;
    const inCanvas = !!target.closest(".editor-frame-canvas");
    const inControls = !!target.closest(".editor-frame-controls");
    const inToolbar = !!target.closest(".mdxeditor-toolbar, .writing-view-header");
    const inPanel = !!target.closest(".editor-frame-details, .editor-frame-outline");
    const wholeSurface = target.matches(".writing-surface");
    const canvas = target.closest<HTMLElement>(".editor-frame-canvas");
    const surfaceTop = canvas ? parseFloat(getComputedStyle(canvas).top) : NaN;
    const inset = local ? 0 : wholeSurface && Number.isFinite(surfaceTop) ? surfaceTop
      : header + (inControls ? 0 : inCanvas || inPanel ? controls + (inToolbar ? 0 : toolbar) : 0);
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
    if (!target.isConnected || !local || owner === container || (!writing && getComputedStyle(container).position !== "static")) return;
    const surface = writing ? container.closest<HTMLElement>(".writing-surface") : null;
    const parentTarget = surface && getComputedStyle(surface).maxHeight !== "none" ? surface : target;
    if (!parentTarget) return;
    const parent = owner.getBoundingClientRect();
    const control = parentTarget.getBoundingClientRect();
    const style = getComputedStyle(target);
    const pageWriting = target.closest<HTMLElement>(".editor-frame")?.dataset.writingScroll === "page";
    const inset = pageWriting ? 0 : (parseFloat(style.getPropertyValue("--editor-header-height")) || 0)
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
