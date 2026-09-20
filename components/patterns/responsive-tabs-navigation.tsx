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
    <div className="min-w-0 lg:sticky lg:top-6">
      <Field className="lg:hidden">
        {label}
        <SelectField value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </SelectField>
      </Field>
      <TabsList variant="sidebar" className="hidden lg:grid" aria-label={label}>
        {children}
      </TabsList>
    </div>
  );
}
