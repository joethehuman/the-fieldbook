"use client";
import { BulkActions } from "./patterns/bulk-actions";
import { useBulkSelection } from "./patterns/bulk-selection";
import { SelectableRows } from "./patterns/selectable-rows";
import { peopleCommands } from "./PeopleBulkActions";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";

import { SettingsSection } from "./patterns/settings-section";
import { ActionGroup } from "./ui/action-group";
import { GroupPicker } from "./patterns/group-picker";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { OnboardingFields } from "./OnboardingFields";
import { equalJson } from "@/lib/equal-json";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { FieldGroup } from "./ui/field";
import { CollectionControls, CollectionEmpty } from "./patterns/collection-controls";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Workspace } from "@/lib/store";
import { teamPath } from "@/lib/team-hierarchy";
type Pending = NonNullable<Workspace["pendingUsers"]>[number];
export function PendingPeople({
  data,
  onChange,
  registerNavigationGuard,
}: {
  registerNavigationGuard?: RegisterNavigationGuard;
  data: Workspace;
  onChange: (data: Workspace) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const { confirm } = useInteractionDialog();
  const baseline = useRef<Pending | null>(null);
  const saving = useRef(false);
  const dirty = !!editing && !equalJson(editing, baseline.current);
  const guard = useRef(async () => true);
  guard.current = async () => !saving.current && (!dirty || await confirm("Discard unsaved pending account changes?"));
  async function openEditor(person: Pending) { if (await guard.current()) { baseline.current = structuredClone(person); setEditing(person); setError(""); } }
  async function closeEditor() { if (await guard.current()) { setEditing(null); setError(""); } }
  useEffect(() => {
    if (!editing) return;
    registerNavigationGuard?.(() => guard.current(), { protected: dirty || busy });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || saving.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { registerNavigationGuard?.(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [!!editing, dirty, busy, registerNavigationGuard]);
  const rows = (data.pendingUsers || []).filter((p) =>
    (p.name + " " + p.email).toLowerCase().includes(query.toLowerCase()),
  ).sort((a, b) => (sort === "reverse" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)) || a.email.localeCompare(b.email));
  const selection = useBulkSelection(
    "pending" + query,
    rows.map((p) => p.email),
  );
  async function save(person: Pending, revoke = false) {
    if (saving.current) return;
    if (!baseline.current?.email && (data.pendingUsers || []).some((p) => p.email.toLowerCase() === person.email)) { setError("A pending account already uses that email."); return; }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const pendingUsers = (data.pendingUsers || []).filter(
        (p) => p.email !== person.email,
      );
      await onChange({
        ...data,
        pendingUsers: revoke ? pendingUsers : (data.pendingUsers || []).some((p) => p.email === person.email) ? (data.pendingUsers || []).map((p) => p.email === person.email ? person : p) : [...pendingUsers, person],
      });
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <SettingsSection
      measure="full"
      id="pending-accounts"
      title={<h2>Pending accounts</h2>}
      guidance="Pre-register a Google email. The person claims this account on verified sign-in, including when registration is closed. No email is sent."
    >
      <Button
        disabled={busy}
        onClick={() =>
          openEditor({
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
        <Plus aria-hidden="true" />
        Pre-register account
      </Button>
      {!editing && error && <p role="alert">{error}</p>}
      <CollectionControls search={      <FormField label="Find a pending account">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </FormField>} sortLabel={sort === "name" ? "Name A–Z" : "Name Z–A"} sort={<FormField label="Sort pending accounts"><SelectField value={sort} onValueChange={setSort}><option value="name">Name A–Z</option><option value="reverse">Name Z–A</option></SelectField></FormField>} filters={query ? [{ id: "query", label: `Search: ${query}`, onRemove: () => setQuery("") }] : []} onClear={() => setQuery("")} />
      <BulkActions
        collectionSize={selection.collectionSize}
        selected={selection.actionIds}
        onSelectionChange={selection.setSelected}
        noun="pending accounts"
        commands={peopleCommands(data, selection.actionIds, onChange, true)}
      />
      <SelectableRows
        label="Pending accounts"
        selected={selection.selected}
        onChange={selection.setSelected}
        scope={query + sort}
        empty={<CollectionEmpty count={rows.length} total={data.pendingUsers?.length || 0} noun="pending accounts" onClear={() => setQuery("")} />}
        rows={rows.map((p) => ({
          id: p.email,
          label: p.name,
          detail: (
            <>
              {p.email} · {p.role === "admin" ? "Administrator" : p.role === "manager" ? "Manager" : "Learner"}{" "}
              <Button
                type="button"
                variant="link"
                onClick={() => void openEditor(p)}
              >
                Edit {p.name}
              </Button>
            </>
          ),
        }))}
      />
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
          <FieldGroup disabled={busy}>
          {error && <p role="alert">{error}</p>}
          {dirty && <p role="status" className="text-caption text-muted-foreground">Unsaved changes</p>}
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
                  {teamPath(t.id, data.teams || [])}
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
              onClick={closeEditor}
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
