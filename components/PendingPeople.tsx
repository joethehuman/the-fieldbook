"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { FormField } from "./patterns/form-field";
import { Input } from "./ui/input";
import { SettingsSection } from "./patterns/settings-section";
import { ActionGroup } from "./ui/action-group";
import { GroupPicker } from "./patterns/group-picker";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { OnboardingFields } from "./OnboardingFields";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { FieldGroup } from "./ui/field";
import { equalJson } from "@/lib/equal-json";
import { teamPath } from "@/lib/team-hierarchy";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import type { Workspace } from "@/lib/store";

type Pending = NonNullable<Workspace["pendingUsers"]>[number];
export function PendingPeople({
  data,
  onChange,
  registerNavigationGuard,
}: {
  data: Workspace;
  onChange: (data: Workspace) => void | Promise<void>;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const [editing, setEditing] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const baseline = useRef<Pending | null>(null);
  const saving = useRef(false);
  const { confirm } = useInteractionDialog();
  const dirty = !!editing && !equalJson(editing, baseline.current);
  const guard = useRef(async () => true);
  guard.current = async () =>
    !saving.current &&
    (!dirty || (await confirm("Discard unsaved person details?")));
  useEffect(() => {
    if (!editing) return;
    registerNavigationGuard?.(() => guard.current(), {
      protected: dirty || busy,
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || saving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      registerNavigationGuard?.(null);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [!!editing, dirty, busy, registerNavigationGuard]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || saving.current) return;
    const person = { ...editing, email: editing.email.trim().toLowerCase() };
    if (
      data.users.some((row) => row.email.trim().toLowerCase() === person.email)
    ) {
      setError("A person already uses that email.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      // The server allocates the stable roster ID. This is a creation command,
      // not a second persistent list of pending people.
      await onChange({ ...data, pendingUsers: [person] });
      setEditing(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <SettingsSection
      measure="full"
      id="preregister-person"
      title={<h2>Add people</h2>}
      guidance="Pre-register a Google email. The person appears in the roster immediately and activates their login on verified sign-in, even when registration is closed. No email is sent."
    >
      {!editing && (
        <Button
          onClick={() => {
            const person: Pending = {
              email: "",
              name: "",
              role: "learner",
              groups: [],
            };
            baseline.current = structuredClone(person);
            setEditing(person);
            setError("");
          }}
        >
          <Plus aria-hidden="true" />
          Pre-register person
        </Button>
      )}
      {editing && (
        <form className="profile-form" onSubmit={save}>
          <FieldGroup disabled={busy}>
            {error && <p role="alert">{error}</p>}
            {dirty && (
              <p role="status" className="text-caption text-muted-foreground">
                Unsaved changes
              </p>
            )}
            <FormField label="Name">
              <Input
                required
                maxLength={80}
                value={editing.name}
                onChange={(event) =>
                  setEditing({ ...editing, name: event.target.value })
                }
              />
            </FormField>
            <FormField label="Google email">
              <Input
                required
                type="email"
                maxLength={254}
                value={editing.email}
                onChange={(event) =>
                  setEditing({ ...editing, email: event.target.value })
                }
              />
            </FormField>
            <OnboardingFields
              user={{ id: "preregistered", ...editing }}
              settings={data.settings}
              onChange={(hireDate) => setEditing({ ...editing, hireDate })}
            />
            <FormField label="Access">
              <SelectField
                value={editing.role}
                onValueChange={(role) =>
                  setEditing({ ...editing, role: role as Pending["role"] })
                }
              >
                <option value="learner">Learner</option>
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </SelectField>
            </FormField>
            <FormField label="Reporting team">
              <SelectField
                value={editing.teamId || ""}
                onValueChange={(teamId) =>
                  setEditing({ ...editing, teamId: teamId || undefined })
                }
              >
                <option value="">No team</option>
                {data.teams?.map((team) => (
                  <option key={team.id} value={team.id}>
                    {teamPath(team.id, data.teams || [])}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <GroupPicker
              groups={data.groups}
              value={editing.groups}
              onChange={(groups) => setEditing({ ...editing, groups })}
            />
            <ActionGroup>
              <Button type="submit" loading={busy}>
                {busy ? "Saving…" : "Save person"}
              </Button>
              <Button
                variant="link"
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await guard.current()) setEditing(null);
                }}
              >
                Cancel
              </Button>
            </ActionGroup>
          </FieldGroup>
        </form>
      )}
    </SettingsSection>
  );
}
