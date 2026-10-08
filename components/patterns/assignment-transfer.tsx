"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Info,
  Layers,
  Network,
  Newspaper,
  Plus,
  Route,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip } from "../ui/tooltip";
import { SelectionViewport } from "../ui/selection-viewport";
import { SearchField } from "./search-field";

export type AssignmentTransferOption = {
  id: string;
  label: string;
  type?: "course" | "curriculum" | "update" | "team" | "group";
  description?: string;
  searchText?: string;
  assignmentCount?: number;
  includedItems?: { id: string; label: string }[];
};
const kinds = {
  course: { label: "Courses", icon: BookOpen },
  curriculum: { label: "Curricula", icon: Route },
  update: { label: "Updates", icon: Newspaper },
  team: { label: "Teams", icon: Network },
  group: { label: "Groups", icon: Layers },
};

/** The content-facing counterpart to audience transfer: one pending change per row. */
export function AssignmentTransfer({
  options,
  value,
  onChange,
  disabled,
  rightLabel = "To add",
  removing = false,
  emptyMessage = "No matching items.",
  searchPlaceholder = "Find content",
  partial = [],
  onAddToAll,
  audienceCount = 1,
}: {
  options: AssignmentTransferOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  rightLabel?: string;
  removing?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  partial?: string[];
  onAddToAll?: (id: string) => void;
  audienceCount?: number;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const focus = useRef<{ pane: string; index: number } | null>(null);
  const [pane, setPane] = useState(value.length ? "selected" : "available");
  const [queries, setQueries] = useState({ available: "", selected: "" });
  const [announcement, setAnnouncement] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const chosen = new Set(value);
  const covered = new Set(
    options
      .filter((option) => chosen.has(option.id) && !partial.includes(option.id))
      .flatMap((option) => option.includedItems?.map((item) => item.id) || []),
  );
  const rememberFocus = () => {
    const active = document.activeElement;
    const section = active?.closest<HTMLElement>("[data-transfer-pane]");
    if (section)
      focus.current = {
        pane: section.dataset.transferPane!,
        index: [...section.querySelectorAll("[data-transfer-action]")].indexOf(
          active!,
        ),
      };
  };
  const move = (option: AssignmentTransferOption, select: boolean) => {
    rememberFocus();
    onChange(
      select
        ? [...new Set([...value, option.id])]
        : value.filter((id) => id !== option.id),
    );
    setAnnouncement(
      `${option.label} ${select ? `moved to ${rightLabel}` : "returned to Available"}.`,
    );
  };
  useLayoutEffect(() => {
    if (!focus.current) return;
    const { pane, index } = focus.current;
    focus.current = null;
    const section = root.current?.querySelector<HTMLElement>(
      `[data-transfer-pane="${pane}"]`,
    );
    const actions = [
      ...(section?.querySelectorAll<HTMLButtonElement>(
        "[data-transfer-action]",
      ) || []),
    ];
    (
      actions[Math.min(Math.max(0, index), actions.length - 1)] ||
      section?.querySelector<HTMLElement>("h3")
    )?.focus({ preventScroll: true });
  }, [value, partial]);
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        className="flex shrink-0 gap-2 md:hidden"
        role="group"
        aria-label="Assignment lists"
      >
        {[
          ["available", "Available"],
          ["selected", `${rightLabel} (${value.length})`],
        ].map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={pane === key ? "default" : "outline"}
            className="flex-1"
            aria-pressed={pane === key}
            aria-controls={`${id}-${key}`}
            onClick={() => setPane(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 md:grid-cols-2">
        {(["available", "selected"] as const).map((key) => {
          const label = key === "available" ? "Available" : rightLabel;
          const all = options
            .filter(
              (option) =>
                chosen.has(option.id) === (key === "selected") &&
                (key === "selected" || !covered.has(option.id)),
            )
            .sort((a, b) => a.label.localeCompare(b.label));
          const terms = queries[key]
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
          const matches = all.filter((option) =>
            terms.every((term) =>
              `${option.label} ${option.description || ""} ${option.searchText || ""}`
                .toLowerCase()
                .includes(term),
            ),
          );
          const sections = [...new Set(matches.map((option) => option.type))];
          return (
            <section
              key={key}
              id={`${id}-${key}`}
              data-transfer-pane={key}
              aria-label={`${label} items`}
              className={cn(
                "min-h-0 min-w-0 flex-col rounded-lg border border-border",
                pane === key ? "flex" : "hidden md:flex",
              )}
            >
              <div className="flex shrink-0 items-center gap-3 border-b border-border p-3">
                <h3
                  tabIndex={-1}
                  className="shrink-0 text-sm font-semibold outline-none"
                >
                  {label}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {all.length}
                  </span>
                </h3>
                <SearchField className="flex-1">
                  <Input
                    type="search"
                    variant="metadata"
                    value={queries[key]}
                    onChange={(e) =>
                      setQueries({ ...queries, [key]: e.target.value })
                    }
                    placeholder={searchPlaceholder}
                    aria-label={`Find ${label.toLowerCase()} items`}
                    disabled={disabled}
                  />
                </SearchField>
              </div>
              <SelectionViewport
                fill
                className="min-h-0 border-t-0"
                aria-label={`${label} results`}
              >
                {sections.map((type) => (
                  <div key={type || "items"}>
                    {type && (
                      <h4 className="sticky top-0 z-10 bg-surface px-3 py-2 text-xs font-medium text-muted-foreground">
                        {kinds[type].label}
                      </h4>
                    )}
                    <ul>
                      {matches
                        .filter((option) => option.type === type)
                        .map((option) => {
                          const Icon = option.type
                            ? kinds[option.type].icon
                            : BookOpen;
                          const action =
                            key === "available"
                              ? removing
                                ? "Remove"
                                : "Add"
                              : removing
                                ? "Keep"
                                : "Remove";
                          return (
                            <li
                              key={option.id}
                              className="border-b border-border last:border-b-0"
                            >
                              <div className="flex min-w-0 items-center gap-2 px-3 py-1">
                                <Icon
                                  className="size-4 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span
                                  className="min-w-0 flex-1 truncate text-sm font-medium"
                                  aria-label={option.label}
                                >
                                  {option.label}
                                </span>
                                {option.includedItems?.length ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Show included courses in ${option.label}`}
                                    aria-expanded={expanded.includes(option.id)}
                                    onClick={() =>
                                      setExpanded(
                                        expanded.includes(option.id)
                                          ? expanded.filter(
                                              (id) => id !== option.id,
                                            )
                                          : [...expanded, option.id],
                                      )
                                    }
                                  >
                                    {option.includedItems.length}
                                    <ChevronDown
                                      className={cn(
                                        expanded.includes(option.id) &&
                                          "rotate-180",
                                      )}
                                    />
                                  </Button>
                                ) : null}
                                {key === "selected" &&
                                  partial.includes(option.id) && (
                                    <>
                                      <span className="shrink-0 text-xs text-muted-foreground">
                                        {option.assignmentCount} of{" "}
                                        {audienceCount}
                                      </span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={disabled}
                                        data-transfer-action={`${option.id}-all`}
                                        aria-label={`Assign ${option.label} to all selected audiences`}
                                        onClick={() => {
                                          rememberFocus();
                                          onAddToAll?.(option.id);
                                          setAnnouncement(
                                            `${option.label} assigned to all selected audiences.`,
                                          );
                                        }}
                                      >
                                        <Plus />
                                        All
                                      </Button>
                                    </>
                                  )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={disabled}
                                  data-transfer-action={option.id}
                                  aria-label={`${action} ${option.label}`}
                                  onClick={() =>
                                    move(option, key === "available")
                                  }
                                >
                                  {action === "Add" || action === "Keep" ? (
                                    <Plus />
                                  ) : (
                                    <X />
                                  )}
                                  {action}
                                </Button>
                              </div>
                              {expanded.includes(option.id) &&
                                !!option.includedItems?.length && (
                                  <ul className="bg-surface pl-5">
                                    {option.includedItems.map((child) => (
                                      <li
                                        key={child.id}
                                        className="flex min-w-0 items-center gap-2 px-3 py-1"
                                      >
                                        <BookOpen
                                          className="size-4 shrink-0 text-muted-foreground"
                                          aria-hidden="true"
                                        />
                                        <span
                                          className="min-w-0 flex-1 truncate text-sm"
                                          aria-label={child.label}
                                        >
                                          {child.label}
                                        </span>
                                        <Tooltip
                                          content={`Through ${option.label}, remove the curriculum to remove this source.`}
                                        >
                                          <Button
                                            type="button"
                                            size="icon"
                                            className="size-7"
                                            variant="ghost"
                                            aria-label={`Assignment source for ${child.label}`}
                                          >
                                            <Info />
                                          </Button>
                                        </Tooltip>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          disabled
                                          aria-label={`Remove ${child.label} through ${option.label}`}
                                        >
                                          <X />
                                          Remove
                                        </Button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ))}
                {!matches.length && (
                  <p className="p-4 text-sm text-muted-foreground">
                    {queries[key]
                      ? emptyMessage
                      : key === "selected"
                        ? `Nothing ${removing ? "to remove" : rightLabel === "Assigned" ? "assigned" : "selected"} yet.`
                        : "No available items."}
                  </p>
                )}
              </SelectionViewport>
            </section>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
