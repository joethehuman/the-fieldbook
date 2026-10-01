"use client";
import type { ReactNode } from "react";
import { Field } from "../ui/field";
import { SelectField } from "../ui/select";
import { TabsList } from "../ui/tabs";
import { useScrollFade } from "./use-scroll-fade";

/** Full navigation on desktop, one compact section picker on narrow screens. */
export function ResponsiveTabsNavigation({
  label,
  value,
  onValueChange,
  options,
  pendingValue,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void | Promise<void>;
  options: { id: string; name: string }[];
  pendingValue?: string | null;
  children: ReactNode;
}) {
  const fade = useScrollFade<HTMLDivElement>();
  return (
    <div data-slot="admin-navigation" className="min-w-0">
      <Field className="@min-[48rem]/workspace:hidden">
        {label}
        <SelectField value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </SelectField>
        <span
          className="min-h-5 text-label text-muted-foreground"
          role="status"
        >
          {pendingValue
            ? `Opening ${options.find((option) => option.id === pendingValue)?.name || "section"}…`
            : ""}
        </span>
      </Field>
      <div
        className="hidden min-h-0 @min-[48rem]/workspace:grid"
        data-slot="admin-navigation-desktop"
      >
        <TabsList
          ref={fade.ref}
          variant="sidebar"
          className="scroll-fade min-h-0 content-start overflow-y-auto overscroll-contain pe-3 [scrollbar-gutter:stable]"
          aria-label={label}
          data-scroll-fade-before={fade.edges.before}
          data-scroll-fade-after={fade.edges.after}
          onScroll={fade.measure}
        >
          {children}
        </TabsList>
      </div>
    </div>
  );
}
