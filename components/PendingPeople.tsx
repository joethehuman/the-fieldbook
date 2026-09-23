"use client";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";

import { SettingsSection } from "./patterns/settings-section";
import { ActionGroup } from "./ui/action-group";
import { GroupPicker } from "./patterns/group-picker";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { OnboardingFields } from "./OnboardingFields";
import { useState } from "react";
import type { Workspace } from "@/lib/store";
type Pending = NonNullable<Workspace["pendingUsers"]>[number];
export function PendingPeople({
  data,
  onChange,
}: {
  data: Workspace;
  onChange: (data: Workspace) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(person: Pending, revoke = false) {
    setBusy(true);
    setError("");
    try {
      const pendingUsers = (data.pendingUsers || []).filter(
        (p) => p.email !== person.email,
      );
      await onChange({
        ...data,
        pendingUsers: revoke ? pendingUsers : [...pendingUsers, person],
      });
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsSection
      id="pending-accounts"
      title={<h2>Pending accounts</h2>}
      guidance="Pre-register a Google email. The person claims this account on verified sign-in, including when registration is closed. No email is sent."
    >
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          setEditing({
            email: "",
            name: "",
            role: "learner",
            groups: [],
            onboardingStart:
              data.settings?.newUserStage === "newhire"
                ? new Date().toISOString().slice(0, 10)
                : undefined,
          })
        }
      >
        Pre-register account
      </Button>
      {error && <p role="alert">{error}</p>}
      {(data.pendingUsers || []).map((p) => (
        <div className="report-course" key={p.email}>
          <span>
            {p.name} · {p.email} · {p.role}
          </span>
          <ActionGroup>
            <Button
              variant="link"
              disabled={busy}
              onClick={() => setEditing(p)}
            >
              Edit
            </Button>
            <Button
              variant="link"
              disabled={busy}
              onClick={() => void save(p, true)}
            >
              Revoke
            </Button>
          </ActionGroup>
        </div>
      ))}
      {editing && (
        <form
          className="profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              ...editing,
              email: editing.email.trim().toLowerCase(),
            });
          }}
        >
          <FormField label="Name">
            <Input
              required
              maxLength={80}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </FormField>
          <FormField label="Google email">
            <Input
              required
              type="email"
              disabled={(data.pendingUsers || []).some(
                (p) => p.email === editing.email,
              )}
              value={editing.email}
              onChange={(e) =>
                setEditing({ ...editing, email: e.target.value })
              }
            />
          </FormField>
          <OnboardingFields
            value={editing.onboardingStart}
            onChange={(onboardingStart) =>
              setEditing({ ...editing, onboardingStart })
            }
          />
          <FormField label="Role">
            <SelectField
              value={editing.role}
              onValueChange={(value) =>
                setEditing({
                  ...editing,
                  role: value as Pending["role"],
                })
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
              onValueChange={(value) =>
                setEditing({ ...editing, teamId: value || undefined })
              }
            >
              <option value="">No team</option>
              {data.teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
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
            <Button variant="default" loading={busy}>
              {busy ? "Saving…" : "Save pending account"}
            </Button>
            <Button
              variant="link"
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </ActionGroup>
        </form>
      )}
    </SettingsSection>
  );
}
