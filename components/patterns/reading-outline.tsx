"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Heading } from "@/lib/markdown-headings";

export function ReadingOutline({
  headings,
  prefix = "#",
}: {
  headings: Heading[];
  prefix?: string;
}) {
  const [active, setActive] = useState("");
  const ref = useRef<HTMLDetailsElement>(null);
  const headingKey = headings.map((heading) => heading.id).join("|");
  useEffect(() => {
    const scrollport = ref.current?.closest<HTMLElement>(".main-content");
    if (!scrollport) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Markdown can replace heading elements while their IDs stay the same.
      const targets = headings
        .map((h) => document.getElementById(h.id))
        .filter((el): el is HTMLElement => !!el);
      const viewport = scrollport.getBoundingClientRect();
      const offset = Math.max(
        viewport.height * 0.25,
        (targets[0]
          ? parseFloat(getComputedStyle(targets[0]).scrollMarginTop) || 0
          : 0) +
          (parseFloat(getComputedStyle(scrollport).scrollPaddingTop) || 0) +
          2,
      );
      let current: HTMLElement | undefined = targets[0];
      for (const target of targets)
        if (target.getBoundingClientRect().top <= viewport.top + offset)
          current = target;
      if (
        scrollport.scrollTop + scrollport.clientHeight >=
        scrollport.scrollHeight - 2
      )
        current = targets.at(-1);
      setActive(current?.id || "");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const fragment = () => {
      const raw = location.hash.includes("?heading=")
        ? location.hash.split("?heading=")[1]
        : location.hash.slice(1);
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        return;
      }
      const target = document.getElementById(id);
      if (target?.closest(".markdown")) {
        target.scrollIntoView();
        target.focus({ preventScroll: true });
      }
      schedule();
    };
    fragment();
    scrollport.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", fragment);
    return () => {
      cancelAnimationFrame(frame);
      scrollport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", fragment);
    };
  }, [headingKey]);
  if (!headings.length) return null;
  const links = (mobile: boolean) =>
    headings.map((heading) => (
      <a
        key={heading.id}
        href={`${prefix}${heading.id}`}
        data-depth={heading.depth}
        aria-current={active === heading.id ? "location" : undefined}
        onClick={
          mobile
            ? () => {
                if (ref.current) ref.current.open = false;
              }
            : undefined
        }
      >
        {heading.text}
      </a>
    ));
  return (
    <aside className="reading-outline" aria-label="On this page">
      <p className="reading-outline-title">On this page</p>
      <details ref={ref} className="reading-outline-disclosure">
        <summary>
          On this page
          <ChevronRight size={14} aria-hidden="true" />
        </summary>
        <nav aria-label="Article sections">{links(true)}</nav>
      </details>
      <nav className="reading-outline-wide" aria-label="Article sections">
        {links(false)}
      </nav>
    </aside>
  );
}
