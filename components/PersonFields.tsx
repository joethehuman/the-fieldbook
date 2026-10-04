"use client";
import { FormField } from "./patterns/form-field";
import { GroupPicker } from "./patterns/group-picker";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select";
import { OnboardingFields } from "./OnboardingFields";
import { teamPath } from "@/lib/team-hierarchy";
import { organizationTeam } from "@/lib/organization-team";
import type { Workspace } from "@/lib/store";
import type { User } from "@/lib/types";
type Person = Pick<
  User,
  "name" | "email" | "role" | "groups" | "teamId" | "hireDate"
>;
export function PersonFields<T extends Person>({
  person,
  data,
  onChange,
  emailLabel,
  emailReadOnly = false,
  roleReadOnly = false,
}: {
  person: T;
  data: Workspace;
  onChange: (person: T) => void;
  emailLabel: string;
  emailReadOnly?: boolean;
  roleReadOnly?: boolean;
}) {
  const root = organizationTeam(
    data.teams || [],
    data.settings?.organizationTeamId,
  );
  return (
    <>
      <FormField label="Name">
        <Input
          required
          maxLength={80}
          value={person.name}
          onChange={(e) => onChange({ ...person, name: e.target.value })}
        />
      </FormField>
      <FormField label={emailLabel}>
        <Input
          type="email"
          required
          readOnly={emailReadOnly}
          maxLength={254}
          value={person.email}
          onChange={(e) => onChange({ ...person, email: e.target.value })}
        />
      </FormField>
      <OnboardingFields
        user={{ id: "person", ...person }}
        settings={data.settings}
        onChange={(hireDate) => onChange({ ...person, hireDate })}
      />
      <FormField label="Access">
        <SelectField
          disabled={roleReadOnly}
          value={person.role}
          onValueChange={(role) =>
            onChange({ ...person, role: role as User["role"] })
          }
        >
          <option value="learner">Learner</option>
          <option value="manager">Manager</option>
          <option value="contributor">Contributor</option>
          <option value="admin">Administrator</option>
        </SelectField>
      </FormField>
      <FormField label="Reporting team">
        <SelectField
          value={person.teamId === root?.id ? "" : person.teamId || ""}
          onValueChange={(teamId) =>
            onChange({ ...person, teamId: teamId || undefined })
          }
        >
          <option value="">Organization (no direct team)</option>
          {data.teams
            ?.filter((team) => team.id !== root?.id)
            .map((team) => (
              <option key={team.id} value={team.id}>
                {teamPath(team.id, data.teams || [])}
              </option>
            ))}
        </SelectField>
      </FormField>
      <GroupPicker
        groups={data.groups}
        value={person.groups}
        onChange={(groups) => onChange({ ...person, groups })}
      />
    </>
  );
}
