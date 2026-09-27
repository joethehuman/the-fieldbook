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
import { useScrollFade } from "./use-scroll-fade";

export function DocumentTree({
  docs,
  order,
  sections: configured = [],
  selected,
  href,
  onOpen,
  onNavigate,
  storageKey,
}: {
  docs: DocLink[];
  order?: string[];
  sections?: DocSection[];
  selected: string | null;
  href: (id: string) => string;
  onOpen?: (id: string) => void;
  onNavigate?: () => void;
  storageKey?: string;
}) {
  const fade = useScrollFade<HTMLElement>();
  const ref = fade.ref;
  const restored = useRef(false);
  const catalogKey = docs
    .map(
      (doc) => `${doc.id}:${doc.category}:${doc.folder}:${doc.sectionId || ""}`,
    )
    .join("|");
  const sections = useMemo(
    () => docSections(docs, order, configured),
    [docs, order, configured],
  );
  const activeFolders = useMemo(() => {
    const result: string[] = [];
    const visit = (branch: DocBranch, path: string[]): boolean => {
      const next = [...path, branch.id];
      const nested = branch.folders.some((folder) => visit(folder, next));
      const active = branch.docs.some((doc) => doc.id === selected) || nested;
      if (active && path.length) result.push(JSON.stringify(next));
      return active;
    };
    sections.forEach((section) => visit(section, []));
    return result;
  }, [sections, selected]);
  const [expanded, setExpanded] = useState<string[]>(() => activeFolders);
  useEffect(() => {
    let savedExpanded: string[] | undefined;
    if (!restored.current && storageKey) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (saved && Array.isArray(saved.expanded))
          savedExpanded = saved.expanded.filter(
            (key: unknown) => typeof key === "string",
          );
        if (ref.current && Number.isFinite(saved?.top))
          ref.current.scrollTop = saved.top;
      } catch {
        /* Storage is optional. */
      }
    }
    restored.current = true;
    setExpanded((current) => {
      const next = [
        ...new Set([...(savedExpanded || current), ...activeFolders]),
      ];
      return next.length === current.length &&
        next.every((key) => current.includes(key))
        ? current
        : next;
    });
  }, [activeFolders, storageKey]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const root = ref.current;
      const active = root?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!root || !active) return;
      const bounds = root.getBoundingClientRect(),
        link = active.getBoundingClientRect();
      if (link.top < bounds.top) root.scrollTop += link.top - bounds.top - 16;
      else if (link.bottom > bounds.bottom)
        root.scrollTop += link.bottom - bounds.bottom + 16;
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, catalogKey]);
  const remember = (next = expanded) => {
    if (!storageKey || !ref.current) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ top: ref.current.scrollTop, expanded: next }),
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
  const documentLink = (doc: DocLink) => (
    <Button
      asChild
      variant="ghost"
      size="sm"
      key={doc.id}
      className="document-link w-full justify-start rounded-control px-2 py-1 text-left text-sm font-normal leading-snug whitespace-normal break-words [overflow-wrap:anywhere] text-foreground/80 aria-[current=page]:text-[color:color-mix(in_srgb,var(--brand)_35%,var(--foreground))] hover:bg-muted-hover hover:text-foreground focus-visible:ring-inset focus-visible:ring-offset-0"
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
          onClick={(event) => {
            remember();
            if (
              !event.button &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            )
              onNavigate?.();
          }}
        >
          {doc.title}
        </IntentLink>
      )}
    </Button>
  );
  const folder = (value: DocBranch, path: string[]): React.ReactNode => {
    const key = JSON.stringify([...path, value.id]);
    return (
      <Collapsible
        open={expanded.includes(key)}
        key={value.id}
        data-branch={key}
        onOpenChange={(open) => {
          const next = open
            ? [...new Set([...expanded, key])]
            : expanded.filter((item) => item !== key);
          setExpanded(next);
          remember(next);
        }}
        className="document-subsection"
      >
        <CollapsibleTrigger className="document-subsection-trigger">
          <span>{value.name}</span>
          <ChevronRight aria-hidden="true" size={14} />
        </CollapsibleTrigger>
        <CollapsibleContent forceMount className="document-subsection-children">
          {value.docs.map(documentLink)}
          {value.folders.map((child) => folder(child, [...path, value.id]))}
        </CollapsibleContent>
      </Collapsible>
    );
  };
  return (
    <nav
      ref={ref}
      className="document-tree scroll-fade"
      aria-label="Documents"
      data-scroll-fade-before={fade.edges.before}
      data-scroll-fade-after={fade.edges.after}
      onScroll={() => {
        remember();
        fade.measure();
      }}
    >
      <noscript>
        <style>{`.document-subsection-children[data-state="closed"] { display: grid; }`}</style>
      </noscript>
      {sections.map((section) => (
        <section className="document-section" key={section.id}>
          <h2 className="document-section-heading">{section.name}</h2>
          <div className="document-section-children">
            {section.docs.map(documentLink)}
            {section.folders.map((child) => folder(child, [section.id]))}
          </div>
        </section>
      ))}
    </nav>
  );
}
