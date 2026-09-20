import type { ComponentProps } from "react";
import { Search } from "lucide-react";
import { Field } from "../ui/field";
import { cn } from "@/lib/utils";
export function SearchField({
  className,
  children,
  ...props
}: ComponentProps<typeof Field>) {
  return (
    <Field
      orientation="horizontal"
      data-slot="search-field"
      className={cn(
        "items-center gap-2 [&>svg]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Search size={16} />
      {children}
    </Field>
  );
}
