import { isValidElement, type ComponentProps, type ReactNode } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../ui/card";
import { FieldGroup } from "../ui/field";
import { cn } from "@/lib/utils";

/** One named settings group. The feature owns its fields, validation and persistence. */
export function SettingsSection({
  title,
  description,
  guidance,
  actions,
  belowActions,
  className,
  children,
  disabled,
  measure = "form",
  ...props
}: Omit<ComponentProps<typeof Card>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  guidance?: ReactNode;
  actions?: ReactNode;
  belowActions?: ReactNode;
  disabled?: boolean;
  measure?: "form" | "full";
}) {
  const headingId = props.id ? `${props.id}-heading` : undefined;
  const guidanceId = props.id && guidance ? `${props.id}-guidance` : undefined;
  const card = (
    <Card
      {...props}
      className={cn("p-0 sm:p-0", className)}
      aria-labelledby={headingId}
    >
      <CardHeader>
        <CardTitle asChild={isValidElement(title)} id={headingId}>
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <FieldGroup
          className={measure === "form" ? "w-full max-w-(--form-width)" : undefined}
          disabled={disabled}
          aria-labelledby={headingId}
          aria-describedby={guidanceId}
        >
          {children}
        </FieldGroup>
      </CardContent>
      {(guidance || actions) && (
        <CardFooter>
          {guidance && (
            <div
              id={guidanceId}
              className="min-w-0 flex-1 basis-64 text-copy text-muted-foreground [overflow-wrap:anywhere]"
            >
              {guidance}
            </div>
          )}
          {actions && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
  if (belowActions === undefined) return card;
  return (
    <div className="grid min-w-0 gap-2">
      {card}
      {belowActions && (
        <div data-slot="settings-below-actions" className="flex justify-end px-5">
          {belowActions}
        </div>
      )}
    </div>
  );
}
