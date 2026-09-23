"use client";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { FieldGroup, FieldDescription } from "@/components/ui/field";
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
      <FormField label="Starting point">
        <SelectField
          aria-describedby="onboarding-target-help"
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
      </FormField>
      {value && (
        <FormField label="Onboarding start date">
          <Input
            aria-describedby="onboarding-target-help"
            type="date"
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </FormField>
      )}
      <FieldDescription id="onboarding-target-help">
        The organization course completion windows determine the target. First
        login does not start onboarding.
      </FieldDescription>
    </FieldGroup>
  );
}
