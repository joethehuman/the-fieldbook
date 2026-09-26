"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Table } from "../ui/table";

/** Keeps wide reading tables scrollable without moving the surrounding prose. */
export function ScrollableMarkdownTable({ children }: { children: ReactNode }) {
  const region = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);

  useEffect(() => {
    const node = region.current;
    if (!node) return;
    const update = () => setMoreRight(node.scrollWidth - node.scrollLeft - node.clientWidth > 2);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    const table = node.querySelector("table");
    if (table) observer.observe(table);
    node.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, []);

  return <div className="markdown-table-wrap" data-more-right={moreRight}>
    <div ref={region} className="markdown-table" role="region" aria-label="Scrollable table" tabIndex={0}>
      <Table>{children}</Table>
    </div>
  </div>;
}
