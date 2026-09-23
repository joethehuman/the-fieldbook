import type { ComponentProps, ReactNode } from "react";
import { Card } from "../ui/card";
import { SectionHeader } from "./layout";
import { FieldGroup } from "../ui/field";

/** One named settings group. The feature owns its fields, validation and persistence. */
export function SettingsSection({
  title,
  description,
  children,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Card>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const headingId = props.id ? `${props.id}-heading` : undefined;
  return (
    <Card {...props} aria-labelledby={headingId}>
      <div className="grid min-w-0 gap-6">
        <div id={headingId}>
          <SectionHeader title={title} description={description} />
        </div>
        <FieldGroup disabled={disabled} aria-labelledby={headingId}>
          {children}
        </FieldGroup>
      </div>
    </Card>
  );
}
