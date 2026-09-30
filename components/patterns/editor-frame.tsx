"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "../ui/button";
import { FieldDescription } from "../ui/field";

export type DetailsReveal = { request: number; field?: string };

/** One writing canvas with optional in-page navigation and content details. */
export function EditorFrame({
  outline,
  outlineContext,
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
  details: ReactNode;
  requirementsCount?: number;
  revealDetails?: DetailsReveal;
  revealCanvas?: number;
  revealOutline?: number;
  disabled?: boolean;
  children: ReactNode;
}) {
  const frame = useRef<HTMLElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const wide = useRef(false);
  const narrow = useRef(false);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const outlineId = useId();
  const detailsId = useId();
  const [panels, setPanels] = useState({ outline: !!outline, details: false });

  useEffect(() => {
    const target = frame.current;
    if (!target) return;
    const viewport = target.closest<HTMLElement>(".main-content");
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const width = target.getBoundingClientRect().width;
      target.style.setProperty("--editor-controls-height", `${controls.current?.getBoundingClientRect().height || 48}px`);
      if (viewport) target.style.setProperty("--editor-viewport-height", `${viewport.clientHeight}px`);
      wide.current = width >= 78 * rem;
      narrow.current = width < 48 * rem;
      if (!wide.current)
        setPanels((current) => current.outline && current.details
          ? { outline: true, details: false } : current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    if (controls.current) observer.observe(controls.current);
    if (viewport) observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!revealDetails) return;
    setPanels((current) => ({ outline: wide.current && current.outline, details: true }));
    const request = requestAnimationFrame(() => {
      const section = revealDetails.field
        ? document.getElementById(revealDetails.field)
        : document.getElementById(detailsId);
      const target = section?.querySelector<HTMLElement>('input, button, textarea, [tabindex="0"]');
      (target || section)?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(request);
  }, [revealDetails, detailsId]);

  useLayoutEffect(() => {
    if (!revealCanvas) return;
    setPanels((current) => ({
      outline: narrow.current ? false : current.outline,
      details: narrow.current ? false : current.details,
    }));
  }, [revealCanvas]);

  useEffect(() => {
    if (!revealOutline) return;
    setPanels((current) => ({ outline: true, details: wide.current && current.details }));
    const request = requestAnimationFrame(() => {
      const section = document.getElementById(outlineId);
      section?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(request);
  }, [revealOutline, outlineId]);

  const open = panels.outline ? panels.details ? "both" : "outline" : panels.details ? "details" : "none";
  return (
    <section ref={frame} className="editor-frame" data-panels={open} aria-label="Writing workspace">
      <div ref={controls} className="editor-frame-controls">
        {outline && (
          <Button ref={outlineToggle} type="button" variant="ghost" size="sm" className="px-0"
            disabled={disabled}
            aria-controls={outlineId} aria-expanded={panels.outline}
            onClick={() => setPanels((current) => ({
              outline: !current.outline,
              details: wide.current ? current.details : false,
            }))}>
            {panels.outline ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            Outline{outlineContext && <span className="text-muted-foreground">· {outlineContext}</span>}
          </Button>
        )}
        <Button ref={detailsToggle} type="button" variant="ghost" size="sm" className="ml-auto px-0"
          disabled={disabled}
          aria-controls={detailsId} aria-expanded={panels.details}
          onClick={() => setPanels((current) => ({
            outline: wide.current ? current.outline : false,
            details: !current.details,
          }))}>
          Details{requirementsCount > 0 && <span className="text-muted-foreground" role="status">· {requirementsCount} required</span>}
          {panels.details ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
        </Button>
      </div>
      <div className="editor-frame-body">
        {panels.outline && outline && (
          <aside id={outlineId} className="editor-frame-outline" aria-label="Course outline"
            onKeyDown={(event) => {
              if (disabled || event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              setPanels((current) => ({ ...current, outline: false }));
              outlineToggle.current?.focus();
            }}>
            {outline}
          </aside>
        )}
        {panels.details && (
          <aside id={detailsId} className="editor-frame-details" aria-label="Content details" tabIndex={-1}
            onKeyDown={(event) => {
              if (disabled || event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              setPanels((current) => ({ ...current, details: false }));
              detailsToggle.current?.focus();
            }}>
            {details}
          </aside>
        )}
        <div key="canvas" className="editor-frame-canvas">{children}</div>
      </div>
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
