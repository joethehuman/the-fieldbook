"use client";

import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { EditorFocusContext } from "./editor-focus";
import { Button } from "../ui/button";
import { FieldDescription } from "../ui/field";
import { useScrollFade } from "./use-scroll-fade";
import { revealEditorTarget } from "./reveal-editor-target";
import { usePhoneLayout } from "./use-phone-layout";
import { PhonePanel } from "./phone-panel";

export type DetailsReveal = { request: number; field?: string };

/** Keep closing content until its slide finishes; closed panels occupy no space. */
function usePanelPresence(open: boolean) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPresent(false); return; }
    const timer = window.setTimeout(() => setPresent(false), 220);
    return () => window.clearTimeout(timer);
  }, [open]);
  return open || present;
}

/** One writing canvas with optional in-page navigation and content details. */
export function EditorFrame({
  outline,
  outlineContext,
  heading,
  details,
  requirementsCount = 0,
  revealDetails,
  revealCanvas,
  revealOutline,
  disabled = false,
  children,
}: {
  outline?: ReactNode;
  outlineContext?: string;
  heading?: ReactNode;
  details: ReactNode;
  requirementsCount?: number;
  revealDetails?: DetailsReveal;
  revealCanvas?: number;
  revealOutline?: number;
  disabled?: boolean;
  children: ReactNode;
}) {
  const focus = useContext(EditorFocusContext);
  const phone = usePhoneLayout();
  const exitFocus = useRef(() => {});
  exitFocus.current = () => { if (focus?.active) focus.toggle(); };
  const frame = useRef<HTMLElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const wide = useRef(false);
  const narrow = useRef(false);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const outlineId = useId();
  const detailsId = useId();
  const [panels, setPanels] = useState({ outline: !!outline, details: false });
  useLayoutEffect(() => {
    if (phone) setPanels({ outline: false, details: false });
  }, [phone]);
  const outlinePresent = usePanelPresence(panels.outline && !!outline);
  const detailsPresent = usePanelPresence(panels.details);
  const outlineFade = useScrollFade<HTMLElement>(panels.outline && !!outline);
  const detailsFade = useScrollFade<HTMLElement>(panels.details);
  useEffect(() => {
    const target = frame.current;
    if (!target) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const width = target.getBoundingClientRect().width;
      wide.current = width >= 78 * rem;
      narrow.current = width < 48 * rem;
      if (!wide.current || phone)
        setPanels((current) => current.outline && current.details
          ? { outline: true, details: false } : current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    if (controls.current) observer.observe(controls.current);
    if (canvas.current) observer.observe(canvas.current);
    return () => {
      observer.disconnect();
    };
  }, [phone]);

  useEffect(() => {
    if (!revealDetails) return;
    exitFocus.current();
    const introduction = revealDetails.field?.startsWith("editor-");
    setPanels((current) => ({ outline: !phone && wide.current && current.outline, details: !introduction }));
    let cancelReveal: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = revealDetails.field
        ? document.getElementById(revealDetails.field)
        : document.getElementById(detailsId);
      const target = section?.matches('input, button, textarea, [tabindex="0"]') ? section
        : section?.querySelector<HTMLElement>('input, button, textarea, [tabindex="0"]');
      const control = target || section;
      if (control) cancelReveal = revealEditorTarget(control, {
        container: introduction ? undefined : document.getElementById(detailsId)?.closest<HTMLElement>('[data-slot="scroll-region"]') || document.getElementById(detailsId),
        context: section && section !== control ? section
          : control.closest<HTMLElement>('[data-slot="field"]') || control,
      });
    });
    return () => { cancelAnimationFrame(request); cancelReveal?.(); };
  }, [revealDetails, detailsId, phone]);

  useLayoutEffect(() => {
    if (!revealCanvas) return;
    setPanels((current) => ({
      outline: narrow.current ? false : current.outline,
      details: narrow.current ? false : current.details,
    }));
  }, [revealCanvas]);

  useEffect(() => {
    if (!revealOutline) return;
    exitFocus.current();
    setPanels((current) => ({ outline: true, details: wide.current && current.details }));
    let cancelReveal: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = document.getElementById(outlineId);
      const target = section?.querySelector<HTMLElement>('button:not(:disabled)');
      if (target && section) cancelReveal = revealEditorTarget(target, { container: section.closest<HTMLElement>('[data-slot="scroll-region"]') || section });
    });
    return () => { cancelAnimationFrame(request); cancelReveal?.(); };
  }, [revealOutline, outlineId]);

  useEffect(() => {
    if (!panels.outline) return;
    let cancelReveal: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = document.getElementById(outlineId);
      const selected = section?.querySelector<HTMLElement>('[aria-current="step"]');
      if (selected && section) cancelReveal = revealEditorTarget(selected, {
        container: section.closest<HTMLElement>('[data-slot="scroll-region"]') || section,
        context: selected.closest<HTMLElement>(".course-builder-steps > div") || selected,
        focus: false,
      });
    });
    return () => { cancelAnimationFrame(request); cancelReveal?.(); };
  }, [panels.outline, outlineContext, outlineId, revealCanvas]);

  const open = panels.outline ? panels.details ? "both" : "outline" : panels.details ? "details" : "none";
  return (
    <section ref={frame} className="editor-frame" data-panels={open} aria-label="Writing workspace">
      <div ref={controls} className="editor-frame-controls" data-heading={heading ? "true" : undefined}>
        {outline && (
          <Button ref={outlineToggle} type="button" variant="ghost" size="sm"
            disabled={disabled}
            aria-controls={outlineId} aria-expanded={panels.outline}
            onClick={() => setPanels((current) => ({
              outline: !current.outline,
              details: wide.current ? current.details : false,
            }))}>
            {panels.outline ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            Outline{outlineContext && <span className="editor-panel-context text-muted-foreground">· {outlineContext}</span>}
          </Button>
        )}
        {heading && <div className="editor-frame-heading">{heading}</div>}
        <Button ref={detailsToggle} type="button" variant="ghost" size="sm" className="ml-auto"
          disabled={disabled}
          aria-controls={detailsId} aria-expanded={panels.details}
          onClick={() => setPanels((current) => ({
            outline: wide.current ? current.outline : false,
            details: !current.details,
          }))}>
          Details{requirementsCount > 0 && <span className="editor-panel-context text-muted-foreground" role="status">· {requirementsCount} required</span>}
          {panels.details ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
        </Button>
      </div>
      <div className="editor-frame-body">
        {!phone && outlinePresent && outline && (
          <div className="editor-frame-panel" data-side="outline" data-open={panels.outline} inert={!panels.outline} aria-hidden={!panels.outline}>
          <aside ref={outlineFade.ref} id={outlineId} className="editor-frame-outline scroll-fade" aria-label="Course outline"
            data-scroll-fade-before={outlineFade.edges.before} data-scroll-fade-after={outlineFade.edges.after}
            onScroll={outlineFade.measure}
            onKeyDown={(event) => {
              if (disabled || event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              setPanels((current) => ({ ...current, outline: false }));
              outlineToggle.current?.focus();
            }}>
            {outline}
          </aside>
          </div>
        )}
        {!phone && detailsPresent && <div className="editor-frame-panel" data-side="details" data-open={panels.details} inert={!panels.details} aria-hidden={!panels.details}>
          <aside ref={detailsFade.ref} id={detailsId} className="editor-frame-details scroll-fade" aria-label="Content details" tabIndex={-1}
            data-scroll-fade-before={detailsFade.edges.before} data-scroll-fade-after={detailsFade.edges.after}
            onScroll={detailsFade.measure}
            onKeyDown={(event) => {
              if (disabled || event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              setPanels((current) => ({ ...current, details: false }));
              detailsToggle.current?.focus();
            }}>
            {details}
          </aside>
        </div>}
        <div key="canvas" ref={canvas} className="editor-frame-canvas">{children}</div>
      </div>
      {phone && outline && <PhonePanel open={panels.outline} title="Outline" description={outlineContext} returnFocus={outlineToggle}
        onOpenChange={(outline) => setPanels({ outline, details: false })}>
        <aside id={outlineId} aria-label="Course outline" className="grid min-w-0 gap-4">{outline}</aside>
      </PhonePanel>}
      {phone && <PhonePanel open={panels.details} title="Details" description={requirementsCount > 0 ? `${requirementsCount} required before publishing` : "Content settings and publishing details"} returnFocus={detailsToggle}
        onOpenChange={(details) => setPanels({ outline: false, details })}>
        <aside id={detailsId} aria-label="Content details" className="grid min-w-0 gap-4">{details}</aside>
      </PhonePanel>}
    </section>
  );
}

/** Compact metadata groups share one panel, without nested settings cards. */
export function EditorDetailsGroup({ id, title, description, children }: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="editor-details-group" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-sm font-semibold">{title}</h3>
      {children}
      {description && <FieldDescription>{description}</FieldDescription>}
    </section>
  );
}
