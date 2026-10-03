"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { FieldGroup } from "./ui/field";
import { equalJson } from "@/lib/equal-json";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import type { Workspace } from "@/lib/store";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "./ui/dialog";
import { ScrollRegion } from "./patterns/scroll-region";
import { Alert } from "./ui/alert";
import { PersonFields } from "./PersonFields";
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
    (!dirty || (await confirm("Discard unsaved user details?")));
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
      setError("A user already uses that email.");
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
  async function close() {
    if (await guard.current()) setEditing(null);
  }
  return (
    <>
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
        Pre-register user
      </Button>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) void close();
        }}
      >
        {editing && (
          <DialogContent size="workflow">
            <DialogTitle>Pre-register user</DialogTitle>
            <DialogDescription>
              Add someone before they sign in. Their verified Google email
              activates this roster entry. No email is sent.
            </DialogDescription>
            <form
              className="flex min-h-0 flex-1 flex-col gap-4"
              onSubmit={save}
            >
              <DialogBody>
                <ScrollRegion className="h-full p-1">
                  <FieldGroup disabled={busy}>
                    {error && <Alert variant="destructive">{error}</Alert>}
                    <PersonFields
                      person={editing}
                      data={data}
                      onChange={setEditing}
                      emailLabel="Google email"
                    />
                  </FieldGroup>
                </ScrollRegion>
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={() => void close()}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={busy}>
                  Pre-register user
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
