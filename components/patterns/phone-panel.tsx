"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { ScrollRegion } from "./scroll-region";

/** A single phone panel with a stable heading, close action and scrolling body. */
export function PhonePanel({ open, onOpenChange, title, description, returnFocus, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  returnFocus: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    function measure() {
      if (!content.current || !viewport || viewport.scale !== 1) return;
      content.current.style.setProperty("--phone-panel-height", `${viewport.height}px`);
      content.current.style.setProperty("--phone-panel-bottom", `${Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)}px`);
    }
    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    return () => {
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, [open]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent ref={content} size="sheet"
      onOpenAutoFocus={(event) => { event.preventDefault(); heading.current?.focus(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus({ preventScroll: true }); }}>
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <DialogTitle ref={heading} tabIndex={-1} className="outline-none">{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description || `${title} for this content.`}
          </DialogDescription>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={`Close ${title.toLowerCase()}`} onClick={() => onOpenChange(false)}><X aria-hidden="true" /></Button>
      </div>
      <ScrollRegion className="min-h-0 flex-1">{children}</ScrollRegion>
    </DialogContent>
  </Dialog>;
}
