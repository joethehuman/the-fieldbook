"use client";
import type { ReactNode } from "react";
import { Field } from "../ui/field";
import { SelectField } from "../ui/select";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";
import { PanelsTopLeft } from "lucide-react";
import { usePhoneLayout } from "./use-phone-layout";
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
  const phone = usePhoneLayout();
  return (
    <div data-slot="admin-navigation" className="min-w-0">
      {phone ? <div className="grid min-w-0 gap-2">
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger aria-label={label}>
            <PanelsTopLeft className="size-4" aria-hidden="true" />
            <span className="flex-1"><SelectValue /></span>
          </SelectTrigger>
          <SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent>
        </Select>
        <span role="status" className={pendingValue ? "text-label text-muted-foreground" : "sr-only"}>
          {pendingValue ? `Opening ${options.find((option) => option.id === pendingValue)?.name || "section"}…` : ""}
        </span>
      </div> : <Field className="@min-[48rem]/workspace:hidden">
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
      </Field>}
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
