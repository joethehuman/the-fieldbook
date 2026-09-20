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
      className={cn("ui-select-trigger", className)}
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
        className={cn("ui-select-content", className)}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="ui-select-scroll">
          <ChevronUp size={14} />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="ui-select-viewport">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="ui-select-scroll">
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
      className={cn("ui-select-item", className)}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ui-select-indicator">
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
      onValueChange={(next) => onValueChange(next.slice(7))}
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
