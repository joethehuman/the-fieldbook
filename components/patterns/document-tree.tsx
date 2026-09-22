"use client";
import { useEffect, useRef, type MouseEvent } from "react";
import { Button } from "../ui/button";
import {
  docSections,
  type DocLink,
  type DocBranch,
} from "@/lib/docs-navigation";

export function DocumentTree({
  docs,
  order,
  selected,
  href,
  onOpen,
  storageKey,
}: {
  docs: DocLink[];
  order?: string[];
  selected: string | null;
  href: (id: string) => string;
  onOpen: (id: string) => void;
  storageKey?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const restored = useRef(false);
  const catalogKey = docs
    .map((doc) => `${doc.id}:${doc.category}:${doc.folder}`)
    .join("|");
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!restored.current && storageKey) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (saved) {
          root.querySelectorAll<HTMLDetailsElement>("details").forEach((el) => {
            el.open = !saved.closed.includes(el.dataset.branch);
          });
          root.scrollTop = saved.top;
        }
      } catch {
        /* Storage is optional. */
      }
    }
    restored.current = true;
    const active = root.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      let parent = active.parentElement;
      while (parent && parent !== root) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      const bounds = root.getBoundingClientRect(),
        link = active.getBoundingClientRect();
      if (link.top < bounds.top) root.scrollTop += link.top - bounds.top - 4;
      else if (link.bottom > bounds.bottom)
        root.scrollTop += link.bottom - bounds.bottom + 4;
    }
  }, [selected, catalogKey, storageKey]);
  const remember = () => {
    if (!storageKey || !ref.current) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          top: ref.current.scrollTop,
          closed: [
            ...ref.current.querySelectorAll<HTMLDetailsElement>("details"),
          ]
            .filter((el) => !el.open)
            .map((el) => el.dataset.branch),
        }),
      );
    } catch {
      /* Navigation works with storage disabled. */
    }
  };
  const open = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    remember();
    onOpen(id);
  };
  const branch = (value: DocBranch, path: string[]): React.ReactNode => (
    <details
      open
      key={value.name}
      data-branch={JSON.stringify([...path, value.name])}
      onToggle={remember}
      className="document-branch"
    >
      <summary>{value.name}</summary>
      <div className="document-children">
        {value.docs.map((doc) => (
          <Button
            asChild
            variant="ghost"
            key={doc.id}
            className="w-full justify-start rounded-sm px-2 py-1.5 text-left text-sm font-normal leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere] aria-[current=page]:bg-background aria-[current=page]:font-medium aria-[current=page]:text-foreground text-muted-foreground focus-visible:ring-inset focus-visible:ring-offset-0"
          >
            <a
              href={href(doc.id)}
              aria-current={selected === doc.id ? "page" : undefined}
              onClick={(event) => open(event, doc.id)}
            >
              {doc.title}
            </a>
          </Button>
        ))}
        {value.folders.map((folder) => branch(folder, [...path, value.name]))}
      </div>
    </details>
  );
  return (
    <nav
      ref={ref}
      className="document-tree"
      aria-label="Documents"
      onScroll={remember}
    >
      {docSections(docs, order).map((section) => branch(section, []))}
    </nav>
  );
}
