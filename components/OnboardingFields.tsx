"use client";
import { SelectField } from "./ui/select";
export function OnboardingFields({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <fieldset>
      <legend>Learning stage</legend>
      <label>
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
      </label>
      {value && (
        <label>
          Onboarding start date
          <input
            type="date"
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
      <small>
        The workspace learning windows determine the target. First login does
        not start onboarding.
      </small>
    </fieldset>
  );
}
