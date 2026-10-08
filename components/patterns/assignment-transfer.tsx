"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
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
import { SelectionViewport } from "../ui/selection-viewport";
import { SearchField } from "./search-field";

export type AssignmentTransferOption = {
  id: string;
  label: string;
  type?: "course" | "curriculum" | "update" | "team" | "group";
  description?: string;
  searchText?: string;
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
}: {
  options: AssignmentTransferOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  rightLabel?: string;
  removing?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const focus = useRef<{ pane: string; index: number } | null>(null);
  const [pane, setPane] = useState("available");
  const [queries, setQueries] = useState({ available: "", selected: "" });
  const [announcement, setAnnouncement] = useState("");
  const chosen = new Set(value);
  const move = (option: AssignmentTransferOption, select: boolean) => {
    const active = document.activeElement;
    const section = active?.closest<HTMLElement>("[data-transfer-pane]");
    if (section)
      focus.current = {
        pane: section.dataset.transferPane!,
        index: [...section.querySelectorAll("[data-transfer-action]")].indexOf(
          active!,
        ),
      };
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
  }, [value]);
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
            .filter((option) => chosen.has(option.id) === (key === "selected"))
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
                              className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-1 last:border-b-0"
                            >
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
                        ? `Nothing ${removing ? "to remove" : "selected"} yet.`
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
