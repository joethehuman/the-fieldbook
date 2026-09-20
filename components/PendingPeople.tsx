"use client";
import { ActionGroup } from "./ui/action-group";
import { GroupPicker } from "./ui/group-picker";
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
    <section className="editor-block">
      <h2>Pending accounts</h2>
      <p>
        Pre-register a Google email. The person claims this account on verified
        sign-in, including when registration is closed. No email is sent.
      </p>
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
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setEditing(p)}
            >
              Edit
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void save(p, true)}
            >
              Revoke
            </button>
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
          <label>
            Name
            <input
              required
              maxLength={80}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            Google email
            <input
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
          </label>
          <OnboardingFields
            value={editing.onboardingStart}
            onChange={(onboardingStart) =>
              setEditing({ ...editing, onboardingStart })
            }
          />
          <label>
            Role
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
          </label>
          <label>
            Reporting team
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
          </label>
          <GroupPicker
            groups={data.groups}
            value={editing.groups}
            onChange={(groups) => setEditing({ ...editing, groups })}
          />
          <ActionGroup>
            <Button variant="default" disabled={busy}>
              {busy ? "Saving…" : "Save pending account"}
            </Button>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </ActionGroup>
        </form>
      )}
    </section>
  );
}
