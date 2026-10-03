"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";

export type HierarchyPickerOption = {
  id: string;
  label: string;
  /** Complete path including the selected item's name. */
  path: string[];
};

export function compactHierarchyPath(path: string[]) {
  return path.length > 3
    ? [path[0], "…", ...path.slice(-2)].join(" / ")
    : path.join(" / ");
}

/** Search chooses an existing value; full ancestry stays available to touch and keyboard. */
export function HierarchyPicker({
  options,
  value,
  onValueChange,
  searchLabel,
  disabled,
  ...props
}: Pick<
  ComponentProps<"button">,
  "id" | "aria-describedby" | "aria-invalid" | "disabled"
> & {
  options: HierarchyPickerOption[];
  value: string;
  onValueChange: (value: string) => void;
  searchLabel: string;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(value);
  const selected = options.find((option) => option.id === value);
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matching = options.filter((option) => {
    const text = `${option.label} ${option.path.join(" ")}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
  const activeIndex = Math.max(
    0,
    matching.findIndex((option) => option.id === activeId),
  );
  const active = matching[activeIndex];
  useEffect(() => {
    if (!open || !active) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, active?.id, activeIndex, listId]);
  function choose(option: HierarchyPickerOption) {
    onValueChange(option.id);
    setOpen(false);
  }
  function move(index: number) {
    if (!matching.length) return;
    const next = (index + matching.length) % matching.length;
    setActiveId(matching[next].id);
  }
  return (
    <div data-slot="hierarchy-picker" className="grid min-w-0 gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery("");
            setActiveId(value);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            {...props}
            type="button"
            disabled={disabled}
            variant="outline"
            title={selected?.path.join(" / ") || selected?.label}
            className="w-full justify-between text-left [&>span]:w-full [&>span]:justify-between"
          >
            <span className="min-w-0 truncate">
              {selected?.label || "Choose a parent"}
            </span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="grid w-[var(--radix-popover-trigger-width)] gap-2 p-2"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
        >
          <Input
            ref={input}
            type="search"
            role="combobox"
            aria-label={searchLabel}
            placeholder="Search names or hierarchy"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={
              active ? `${listId}-${activeIndex}` : undefined
            }
            autoComplete="off"
            disabled={disabled}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveId("");
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                move(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (active) choose(active);
              }
            }}
          />
          <div
            id={listId}
            role="listbox"
            aria-label={searchLabel}
            className="max-h-60 overflow-y-auto pe-2 [scrollbar-gutter:stable]"
          >
            {matching.map((option, index) => (
              <div
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.id === value}
                aria-label={option.path.join(" / ") || option.label}
                title={option.path.join(" / ") || option.label}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-control px-2 py-2 text-label hover:bg-accent",
                  active?.id === option.id && "bg-accent",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveId(option.id)}
                onClick={() => choose(option)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{option.label}</div>
                  {option.path.length > 1 && (
                    <div
                      className="truncate text-xs text-muted-foreground"
                      aria-hidden="true"
                    >
                      {compactHierarchyPath(option.path.slice(0, -1))}
                    </div>
                  )}
                </div>
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    option.id !== value && "invisible",
                  )}
                  aria-hidden="true"
                />
              </div>
            ))}
            {!matching.length && (
              <p className="px-2 py-3 text-copy text-muted-foreground">
                No matching teams.
              </p>
            )}
          </div>
          <div className="grid h-16 min-w-0 content-start gap-1 border-t pt-2">
            <p className="text-xs text-muted-foreground">Full hierarchy</p>
            <div
              tabIndex={0}
              role="region"
              aria-label="Full hierarchy"
              className="min-w-0 overflow-x-auto whitespace-nowrap pb-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {active?.path.join(" / ") || active?.label || "No matching team"}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
