import type { ComponentProps, ReactNode } from "react";
import { Field, FieldDescription, FieldError } from "../ui/field";
import { Input } from "../ui/input";

/** Explicit IDs keep labels separate from help/error copy; validation stays with the caller. */
export function TextField({
  id,
  label,
  description,
  error,
  ...props
}: ComponentProps<typeof Input> & {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  error?: string;
}) {
  const describedBy =
    [
      props["aria-describedby"],
      description && `${id}-description`,
      error && `${id}-error`,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div data-slot="text-field" className="grid min-w-0 gap-2">
      <Field htmlFor={id}>{label}</Field>
      <Input
        {...props}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : props["aria-invalid"]}
      />
      {description && (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}
