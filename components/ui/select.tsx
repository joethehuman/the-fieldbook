"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// shadcn/ui composition, styled with Fieldbook's shared CSS tokens.
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;
export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm font-normal text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 [&>span:first-child]:truncate [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={16} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={5}
        className={cn(
          "relative z-50 max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex justify-center py-1">
          <ChevronUp size={14} />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-0">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex justify-center py-1">
          <ChevronDown size={14} />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-9 cursor-default select-none items-center rounded-sm py-2 pr-8 pl-3 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:font-medium",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
        <Check size={14} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

// Preserve declarative option lists while moving interaction, focus, and typeahead to Radix.
// Prefix every value so empty-string options are valid and cannot collide with real IDs.
function options(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (
      !React.isValidElement<{
        value?: string | number;
        disabled?: boolean;
        children?: React.ReactNode;
      }>(child)
    )
      return null;
    if (child.type === React.Fragment) return options(child.props.children);
    const value =
      child.props.value ??
      (typeof child.props.children === "string" ? child.props.children : "");
    return (
      <SelectItem
        key={String(value)}
        value={`option:${value}`}
        disabled={child.props.disabled}
      >
        {child.props.children}
      </SelectItem>
    );
  });
}
export function SelectField({
  value,
  onValueChange,
  children,
  disabled,
  required,
  name,
  ...props
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  name?: string;
} & Omit<
  React.ComponentProps<typeof SelectTrigger>,
  "value" | "onChange" | "defaultValue"
>) {
  return (
    <Select
      value={`option:${value}`}
      onValueChange={(next) => {
        // Radix's native form bridge can emit an empty value while options
        // refresh. Every real option (including empty-string IDs) is prefixed.
        if (next.startsWith("option:")) onValueChange(next.slice(7));
      }}
      disabled={disabled}
      required={required}
    >
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
      <SelectTrigger {...props}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{options(children)}</SelectContent>
    </Select>
  );
}
