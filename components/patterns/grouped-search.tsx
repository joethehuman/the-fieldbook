"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";

export type GroupedSearchOption = {
  id: string;
  group: string;
  label: string;
  description?: string;
  /** Full searchable text, including any compacted ancestry. */
  keywords?: string;
};

/** Local discovery over an owner-authorized collection, grouped before ranking. */
export function GroupedSearch({
  options,
  onSelect,
  queryAction,
  placeholder = "Search",
  ...props
}: Pick<ComponentProps<"input">, "id" | "aria-describedby" | "disabled"> & {
  options: GroupedSearchOption[];
  onSelect: (id: string) => void;
  queryAction?: (query: string) => GroupedSearchOption | null;
  placeholder?: string;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("");
  const [paging, setPaging] = useState<{
    query: string;
    limits: Record<string, number>;
  }>({ query: "", limits: {} });
  const search = query.trim().toLocaleLowerCase();
  const words = search.split(/\s+/).filter(Boolean);
  const matching = options.filter((option) => {
    const text =
      `${option.label} ${option.description || ""} ${option.keywords || ""}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
  const groups = [...new Set(options.map((option) => option.group))];
  const limits = paging.query === query ? paging.limits : {};
  const action = search ? queryAction?.(query.trim()) : null;
  const sections = groups.map((group) => {
    const rows = matching.filter((option) => option.group === group);
    if (search)
      rows.sort((a, b) => {
        const score = (option: GroupedSearchOption) => {
          const label = option.label.toLocaleLowerCase();
          return label === search ? 0 : label.startsWith(search) ? 1 : 2;
        };
        return (
          score(a) - score(b) ||
          a.label.localeCompare(b.label) ||
          a.id.localeCompare(b.id)
        );
      });
    const limit = limits[group] || 6;
    return {
      group,
      rows: [
        ...(action?.group === group ? [action] : []),
        ...rows.slice(0, limit),
      ],
      remaining: Math.max(0, rows.length - limit),
    };
  });
  const visible = sections.flatMap((section) => section.rows);
  const activeIndex = Math.max(
    0,
    visible.findIndex((option) => option.id === activeId),
  );
  const active = visible[activeIndex];
  useEffect(() => {
    if (!open || !active) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, active?.id, activeIndex, listId]);
  function choose(id: string) {
    onSelect(id);
    input.current?.focus({ preventScroll: true });
    setOpen(false);
    setQuery("");
    setActiveId("");
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          {...props}
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && active ? `${listId}-${activeIndex}` : undefined
          }
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onFocus={() => {
            if (!props.disabled) setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveId("");
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
              (open || event.key.startsWith("Arrow"))
            ) {
              // Home/End without Alt keep native text editing.
              if (["Home", "End"].includes(event.key) && !event.altKey) return;
              event.preventDefault();
              setOpen(true);
              if (visible.length) {
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? visible.length - 1
                      : (activeIndex +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          visible.length) %
                        visible.length;
                setActiveId(visible[next].id);
              }
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (active) choose(active.id);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="grid w-[var(--radix-popover-trigger-width)] min-w-0 gap-2 p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target === input.current) event.preventDefault();
        }}
      >
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="max-h-96 overflow-y-auto pe-2 [scrollbar-gutter:stable]"
        >
          {sections
            .filter((section) => section.rows.length)
            .map((section, groupIndex) => (
              <div
                key={section.group}
                role="group"
                aria-labelledby={`${listId}-group-${groupIndex}`}
                className="grid gap-1 pb-2"
              >
                <p
                  id={`${listId}-group-${groupIndex}`}
                  className="px-2 py-1 text-xs font-medium text-muted-foreground"
                >
                  {section.group}
                </p>
                {section.rows.map((option) => (
                  <div
                    key={option.id}
                    id={`${listId}-${visible.indexOf(option)}`}
                    role="option"
                    aria-selected={active?.id === option.id}
                    aria-label={`${option.label}${option.description ? ` — ${option.description}` : ""}`}
                    title={
                      option.keywords || option.description || option.label
                    }
                    className={cn(
                      "cursor-pointer rounded-control px-2 py-2 text-label hover:bg-accent",
                      active?.id === option.id && "bg-accent",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerMove={() => setActiveId(option.id)}
                    onClick={() => choose(option.id)}
                  >
                    <p className="truncate">{option.label}</p>
                    {option.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          {!visible.length && (
            <p className="px-2 py-3 text-copy text-muted-foreground">
              No matching results.
            </p>
          )}
        </div>
        {sections.some((section) => section.remaining) && (
          <div className="flex flex-wrap gap-2 border-t pt-2">
            {sections
              .filter((section) => section.remaining)
              .map((section) => (
                <Button
                  key={section.group}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setPaging({
                      query,
                      limits: {
                        ...limits,
                        [section.group]: (limits[section.group] || 6) + 6,
                      },
                    })
                  }
                >
                  More {section.group.toLocaleLowerCase()} ({section.remaining})
                </Button>
              ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
