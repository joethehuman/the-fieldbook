"use client";
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
      <button
        className="secondary"
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
      </button>
      {error && <p role="alert">{error}</p>}
      {(data.pendingUsers || []).map((p) => (
        <div className="report-course" key={p.email}>
          <span>
            {p.name} · {p.email} · {p.role}
          </span>
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
        </div>
      ))}
      {editing && (
        <form
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
            <select
              value={editing.role}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  role: e.target.value as Pending["role"],
                })
              }
            >
              <option value="learner">Learner</option>
              <option value="manager">Manager</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <label>
            Reporting team
            <select
              value={editing.teamId || ""}
              onChange={(e) =>
                setEditing({ ...editing, teamId: e.target.value || undefined })
              }
            >
              <option value="">No team</option>
              {data.teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Assignment groups</legend>
            {data.groups.map((g) => (
              <label className="checkbox-label" key={g.id}>
                <input
                  type="checkbox"
                  checked={editing.groups.includes(g.id)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      groups: e.target.checked
                        ? [...editing.groups, g.id]
                        : editing.groups.filter((id) => id !== g.id),
                    })
                  }
                />
                {g.name}
              </label>
            ))}
          </fieldset>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save pending account"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
