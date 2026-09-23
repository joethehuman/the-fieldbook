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
    const container = ref.current?.closest(".reading-layout");
    if (!container) return;
    let previousWide: boolean | undefined;
    const adapt = () => {
      const wide =
        container.clientWidth >=
        60 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (ref.current && wide !== previousWide) ref.current.open = wide;
      previousWide = wide;
    };
    const observer = new ResizeObserver(adapt);
    observer.observe(container);
    adapt();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let frame = 0;
    const targets = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => !!el);
    const update = () => {
      frame = 0;
      const offset = Math.max(
        window.innerHeight * 0.25,
        (targets[0]
          ? parseFloat(getComputedStyle(targets[0]).scrollMarginTop)
          : 0) +
          (parseFloat(
            getComputedStyle(document.documentElement).scrollPaddingTop,
          ) || 0) +
          2,
      );
      let current: HTMLElement | undefined = targets[0];
      for (const target of targets)
        if (target.getBoundingClientRect().top <= offset) current = target;
      if (
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2
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
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", fragment);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", fragment);
    };
  }, [headingKey]);
  if (!headings.length) return null;
  return (
    <aside className="reading-outline" aria-label="On this page">
      <details ref={ref} open>
        <summary>
          On this page
          <ChevronRight size={14} aria-hidden="true" />
        </summary>
        <nav aria-label="Article sections">
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`${prefix}${heading.id}`}
              data-depth={heading.depth}
              aria-current={active === heading.id ? "location" : undefined}
              onClick={() => {
                if (
                  ref.current &&
                  getComputedStyle(ref.current.closest(".reading-outline")!)
                    .position !== "sticky"
                )
                  ref.current.open = false;
              }}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      </details>
    </aside>
  );
}
