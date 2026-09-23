import type { ComponentProps, ReactNode } from "react";
import { Card } from "../ui/card";
import { SectionHeader } from "./layout";
import { FieldGroup } from "../ui/field";

/** A settings group owns heading, explanatory copy and field rhythm, never persistence. */
export function SettingsSection({
  title,
  description,
  children,
  ...props
}: Omit<ComponentProps<typeof Card>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <Card {...props}>
      <div className="grid min-w-0 gap-6">
        <SectionHeader title={title} description={description} />
        <FieldGroup>{children}</FieldGroup>
      </div>
    </Card>
  );
}
