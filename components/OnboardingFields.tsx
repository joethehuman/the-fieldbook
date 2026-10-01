"use client";
import { useId } from "react";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { FieldGroup, FieldDescription } from "@/components/ui/field";
import { learningStage, onboardingClockTarget } from "@/lib/learning";
import type { User } from "@/lib/types";
import type { SiteSettings } from "@/lib/settings";

export function OnboardingFields({
  user,
  settings,
  onChange,
}: {
  user: Pick<User, "id" | "hireDate" | "onboardingStart" | "onboardingDays">;
  settings?: SiteSettings;
  onChange: (hireDate: string | undefined) => void;
}) {
  const helpId = useId();
  const target = onboardingClockTarget(user, settings);
  return (
    <FieldGroup>
      <legend>Onboarding</legend>
      <FormField label="Hire date">
        <Input
          aria-describedby={helpId}
          type="date"
          value={user.hireDate || ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      </FormField>
      <FieldDescription id={helpId}>
        {learningStage(user, settings)}
        {target
          ? ` · Onboarding ends ${target}.`
          : " · No onboarding clock."}{" "}
        The clock starts on the hire date and uses the configured onboarding
        window. First sign-in does not start it. The stage changes automatically
        when the window ends.
        {user.onboardingStart &&
          ` Recorded onboarding start: ${user.onboardingStart}. This history is retained; a confirmed hire date takes precedence.`}
      </FieldDescription>
    </FieldGroup>
  );
}
