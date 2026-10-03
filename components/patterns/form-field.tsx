"use client";

import {
  cloneElement,
  useId,
  type ReactElement,
  type ReactNode,
  type ComponentProps,
} from "react";
import { Field, FieldDescription, FieldError } from "../ui/field";
import { cn } from "@/lib/utils";

type ControlProps = Pick<
  ComponentProps<"input">,
  "id" | "aria-describedby" | "aria-invalid"
>;

/** One labelable control. Owns associations and spacing, never validation or saving. */
export function FormField({
  label,
  description,
  error,
  errorPlaceholder,
  visuallyHiddenLabel = false,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  /** Reserve wrapping space for anticipated validation without announcing it. */
  errorPlaceholder?: ReactNode;
  visuallyHiddenLabel?: boolean;
  children: ReactElement<ControlProps>;
}) {
  const generatedId = useId();
  const id = children.props.id || generatedId;
  const describedBy =
    [
      children.props["aria-describedby"],
      description && `${id}-description`,
      error && `${id}-error`,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div
      data-slot="field"
      className={cn("grid min-w-0 gap-2", className)}
      {...props}
    >
      <Field
        htmlFor={id}
        className={visuallyHiddenLabel ? "sr-only" : undefined}
      >
        {label}
      </Field>
      {cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })}
      {description && (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      )}
      {(error || errorPlaceholder) && (
        <FieldError
          id={error ? `${id}-error` : undefined}
          aria-hidden={error ? undefined : true}
          className={!error ? "invisible" : undefined}
        >
          {error || errorPlaceholder}
        </FieldError>
      )}
    </div>
  );
}
