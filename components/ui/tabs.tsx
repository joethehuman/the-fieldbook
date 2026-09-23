"use client";
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
export const Tabs = TabsPrimitive.Root;
export function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: "default" | "sidebar";
}) {
  return (
    <TabsPrimitive.List
      data-variant={variant}
      className={cn(
        "group/tabs",
        variant === "sidebar"
          ? "grid gap-6"
          : "inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex min-h-control items-center justify-center gap-2 rounded-md px-3 py-2 text-label font-medium text-muted-foreground outline-none transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:text-disabled-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs group-data-[variant=sidebar]/tabs:justify-start group-data-[variant=sidebar]/tabs:text-left group-data-[variant=sidebar]/tabs:[&_svg]:size-4 group-data-[variant=sidebar]/tabs:[&_svg]:shrink-0 group-data-[variant=sidebar]/tabs:data-[state=active]:bg-accent group-data-[variant=sidebar]/tabs:data-[state=active]:shadow-none",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "mt-6 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
