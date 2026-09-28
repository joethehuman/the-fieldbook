"use client";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
export function FilterOptions({
  label,
  options,
  value,
  onValueChange,
  variant = "buttons",
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  variant?: "buttons" | "underline";
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex max-w-full flex-wrap", variant === "underline" ? "gap-4 border-b border-border" : "gap-2")}>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={variant === "underline" ? "ghost" : "outline"}
          size={variant === "underline" ? "default" : "sm"}
          aria-pressed={value === option.value}
          className={cn(
            variant === "underline" && "relative rounded-sm border-0 px-1 py-2 text-muted-foreground hover:bg-transparent hover:text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent",
            variant === "underline" && value === option.value && "text-foreground after:bg-foreground",
            variant === "buttons" && value === option.value &&
              "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground",
          )}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
