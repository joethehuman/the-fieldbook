"use client";

import { useId, useRef, useState, type ComponentProps } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "list"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  listLabel: string;
};

/** Editable suggestions: free text is valid; selection also normalizes existing names. */
export function CreatableCombobox({
  value,
  onValueChange,
  options,
  listLabel,
  disabled,
  ...props
}: Props) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(false);
  const [active, setActive] = useState(-1);
  const unique = [
    ...new Map(
      options.map((name) => [name.trim().toLocaleLowerCase(), name.trim()]),
    ).values(),
  ].filter(Boolean);
  const query = value.trim();
  const exact = unique.find(
    (name) => name.toLocaleLowerCase() === query.toLocaleLowerCase(),
  );
  const matches = unique.filter(
    (name) =>
      !filter || name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const items = matches.map((name) => ({ value: name, create: false }));
  if (query && !exact) items.push({ value: query, create: true });
  function choose(name: string) {
    onValueChange(name);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  }
  function move(index: number) {
    setActive(index);
    requestAnimationFrame(() =>
      document
        .getElementById(`${listId}-${index}`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchor} className="relative min-w-0">
          <Input
            {...props}
            ref={input}
            disabled={disabled}
            value={value}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && !disabled}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={
              open && active >= 0 && items[active]
                ? `${listId}-${active}`
                : undefined
            }
            autoComplete="off"
            className={cn("pr-10", props.className)}
            onFocus={() => {
              setFilter(false);
              setActive(-1);
            }}
            onClick={() => setOpen(true)}
            onChange={(event) => {
              onValueChange(event.target.value);
              setFilter(true);
              setActive(-1);
              setOpen(true);
            }}
            onBlur={(event) => {
              onValueChange(exact || query);
              props.onBlur?.(event);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                if (items.length)
                  move(
                    event.key === "ArrowDown"
                      ? (active + 1) % items.length
                      : active < 0
                        ? items.length - 1
                        : (active - 1 + items.length) % items.length,
                  );
              } else if (event.key === "Enter" && open) {
                event.preventDefault();
                choose(items[active]?.value || exact || query);
              } else if (event.key === "Escape" && open) {
                event.preventDefault();
                setOpen(false);
              } else if (event.key === "Tab") setOpen(false);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            tabIndex={-1}
            disabled={disabled}
            aria-label={`Show ${listLabel.toLowerCase()}`}
            className="absolute right-0 top-0"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              input.current?.focus();
              setFilter(false);
              setActive(-1);
              setOpen(!open);
            }}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (
            event.target instanceof Node &&
            anchor.current?.contains(event.target)
          )
            event.preventDefault();
        }}
      >
        <div
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="max-h-60 overflow-y-auto"
        >
          {items.map((item, index) => (
            <div
              key={item.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={!item.create && item.value === value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-label outline-none hover:bg-accent",
                active === index && "bg-accent",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(item.value)}
            >
              {item.create ? (
                <Plus size={16} aria-hidden="true" className="shrink-0" />
              ) : (
                <Check
                  size={16}
                  aria-hidden="true"
                  className={cn(
                    "shrink-0",
                    item.value !== value && "invisible",
                  )}
                />
              )}
              <span className="min-w-0 break-words">
                {item.create ? `Add “${item.value}”` : item.value}
              </span>
            </div>
          ))}
          {!items.length && (
            <p className="px-3 py-2 text-copy text-muted-foreground">
              Type a name to add it.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
