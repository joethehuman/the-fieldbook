"use client";
import type { ReactNode } from "react";
import { Field } from "../ui/field";
import { SelectField } from "../ui/select";
import { TabsList } from "../ui/tabs";

/** Full navigation on desktop, one compact section picker on narrow screens. */
export function ResponsiveTabsNavigation({
  label,
  value,
  onValueChange,
  options,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void | Promise<void>;
  options: { id: string; name: string }[];
  children: ReactNode;
}) {
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
      </Field>
      <div
        className="hidden min-h-0 @min-[48rem]/workspace:grid"
        data-slot="admin-navigation-desktop"
      >
        <span className="border-b border-border px-3 pb-3 text-sm font-semibold">
          Administration
        </span>
        <TabsList
          variant="sidebar"
          className="min-h-0 overflow-y-auto overscroll-contain pt-3 [scrollbar-gutter:stable]"
          aria-label={label}
        >
          {children}
        </TabsList>
      </div>
    </div>
  );
}
