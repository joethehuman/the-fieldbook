"use client";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../ui/collapsible";
import { Button } from "../ui/button";
import { IntentLink } from "./intent-link";
import {
  docSections,
  type DocLink,
  type DocBranch,
  type DocSection,
} from "@/lib/docs-navigation";

export function DocumentTree({
  docs,
  order,
  sections: configured = [],
  selected,
  href,
  onOpen,
  storageKey,
}: {
  docs: DocLink[];
  order?: string[];
  sections?: DocSection[];
  selected: string | null;
  href: (id: string) => string;
  onOpen?: (id: string) => void;
  storageKey?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const restored = useRef(false);
  const [closed, setClosed] = useState<string[]>([]);
  const catalogKey = docs
    .map(
      (doc) => `${doc.id}:${doc.category}:${doc.folder}:${doc.sectionId || ""}`,
    )
    .join("|");
  const sections = useMemo(
    () => docSections(docs, order, configured),
    [docs, order, configured],
  );
  useEffect(() => {
    let savedClosed: string[] | undefined;
    if (!restored.current && storageKey) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (saved && Array.isArray(saved.closed)) savedClosed = saved.closed;
        if (ref.current && Number.isFinite(saved?.top))
          ref.current.scrollTop = saved.top;
      } catch {
        /* Storage is optional. */
      }
    }
    restored.current = true;
    const ancestors: string[] = [];
    const containsSelected = (branch: DocBranch, path: string[]): boolean => {
      const next = [...path, branch.id];
      const nested = branch.folders
        .map((folder) => containsSelected(folder, next))
        .some(Boolean);
      const contains = branch.docs.some((doc) => doc.id === selected) || nested;
      if (contains) ancestors.push(JSON.stringify(next));
      return contains;
    };
    sections.forEach((section) => containsSelected(section, []));
    setClosed((current) =>
      (savedClosed || current).filter((key) => !ancestors.includes(key)),
    );
  }, [selected, catalogKey, storageKey, sections]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const root = ref.current;
      const active = root?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!root || !active) return;
      const bounds = root.getBoundingClientRect(),
        link = active.getBoundingClientRect();
      if (link.top < bounds.top) root.scrollTop += link.top - bounds.top - 4;
      else if (link.bottom > bounds.bottom)
        root.scrollTop += link.bottom - bounds.bottom + 4;
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, catalogKey]);
  const remember = (next = closed) => {
    if (!storageKey || !ref.current) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ top: ref.current.scrollTop, closed: next }),
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
    onOpen?.(id);
  };
  const branch = (value: DocBranch, path: string[]): React.ReactNode => {
    const key = JSON.stringify([...path, value.id]);
    return (
      <Collapsible
        open={!closed.includes(key)}
        key={value.id}
        data-branch={key}
        onOpenChange={(open) => {
          const next = open
            ? closed.filter((item) => item !== key)
            : [...closed, key];
          setClosed(next);
          remember(next);
        }}
        className="document-branch"
      >
        <CollapsibleTrigger className="document-branch-trigger">
          <span>{value.name}</span>
          <ChevronRight aria-hidden="true" size={14} />
        </CollapsibleTrigger>
        <CollapsibleContent forceMount className="document-children">
          {value.docs.map((doc) => (
            <Button
              asChild
              variant="ghost"
              key={doc.id}
              className="w-full justify-start rounded-control px-2 py-1.5 text-left text-sm font-normal leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere] aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground text-muted-foreground focus-visible:ring-inset focus-visible:ring-offset-0"
            >
              {onOpen ? (
                <a
                  href={href(doc.id)}
                  aria-current={selected === doc.id ? "page" : undefined}
                  onClick={(event) => open(event, doc.id)}
                >
                  {doc.title}
                </a>
              ) : (
                <IntentLink
                  href={href(doc.id)}
                  aria-current={selected === doc.id ? "page" : undefined}
                  onClick={() => remember()}
                >
                  {doc.title}
                </IntentLink>
              )}
            </Button>
          ))}
          {value.folders.map((folder) => branch(folder, [...path, value.id]))}
        </CollapsibleContent>
      </Collapsible>
    );
  };
  return (
    <nav
      ref={ref}
      className="document-tree"
      aria-label="Documents"
      onScroll={() => remember()}
    >
      {sections.map((section) => branch(section, []))}
    </nav>
  );
}
