"use client";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field } from "@/components/ui/field";
import { SelectField } from "./ui/select";
export function OnboardingFields({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <FieldGroup>
      <legend>Onboarding</legend>
      <Field>
        Starting point
        <SelectField
          value={value ? "new" : "existing"}
          onValueChange={(value) =>
            onChange(
              value === "new"
                ? new Date().toISOString().slice(0, 10)
                : undefined,
            )
          }
        >
          <option value="existing">Existing user — stay current</option>
          <option value="new">New user — onboarding window</option>
        </SelectField>
      </Field>
      {value && (
        <Field>
          Onboarding start date
          <Input
            type="date"
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )}
      <small>
        The organization course completion windows determine the target. First
        login does not start onboarding.
      </small>
    </FieldGroup>
  );
}
