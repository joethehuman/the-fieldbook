"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Workspace } from "@/lib/store";
import type { LearningAction } from "@/lib/learning";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import { isOrganizationChangeCanceled } from "@/lib/organization-change";
import {
  editsCompleteUpdateSelection,
  initialUpdateSelection,
  updateSelectionActions,
  updateSelectionOptions,
  updateSelectionSnapshot,
  type UpdateAssignmentTarget,
} from "@/lib/update-assignment-selection";
import { AssignmentTransfer } from "./patterns/assignment-transfer";
import { SaveChangesControl } from "./patterns/save-changes-control";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "./ui/dialog";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";

export function UpdateAssignmentPicker({
  data,
  target,
  title,
  onLearningMany,
  onPrepare,
  registerNavigationGuard,
  onFinish,
}: {
  data: Workspace;
  target: UpdateAssignmentTarget;
  title: string;
  onLearningMany: (actions: LearningAction[]) => Promise<void>;
  onPrepare?: () => Promise<Workspace | null>;
  registerNavigationGuard?: RegisterNavigationGuard;
  onFinish: (saved: boolean, error?: Error) => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [generation, setGeneration] = useState(0);
  const initial = useRef<string[]>([]);
  const snapshot = useRef("");
  const running = useRef(true);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const discardDone = useRef<((accepted: boolean) => void) | null>(null);
  const latest = useRef({ data, onPrepare, onFinish, onLearningMany });
  latest.current = { data, onPrepare, onFinish, onLearningMany };
  const complete = editsCompleteUpdateSelection(target);
  const dirty =
    JSON.stringify([...selected].sort()) !==
    JSON.stringify([...initial.current].sort());
  const notify = useToast();

  async function prepare(refresh = false) {
    if (running.current && workspace) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const prepared = latest.current.onPrepare
        ? await latest.current.onPrepare()
        : latest.current.data;
      if (!mounted.current) return;
      if (!prepared) {
        latest.current.onFinish(false);
        return;
      }
      const nextInitial = initialUpdateSelection(prepared, target);
      const available = new Set(
        updateSelectionOptions(prepared, target).map((option) => option.id),
      );
      const added = selected.filter((key) => !initial.current.includes(key));
      const removed = new Set(
        initial.current.filter((key) => !selected.includes(key)),
      );
      const nextSelection = refresh
        ? complete
          ? [
              ...new Set([
                ...nextInitial.filter((key) => !removed.has(key)),
                ...added,
              ]),
            ]
          : selected
        : complete
          ? nextInitial
          : target.kind === "audiences"
            ? target.selected || []
            : [];
      initial.current = nextInitial;
      snapshot.current = updateSelectionSnapshot(prepared);
      setWorkspace(prepared);
      setSelected(nextSelection.filter((key) => available.has(key)));
      setStale(false);
      setGeneration((value) => value + 1);
    } catch (caught) {
      if (mounted.current) setError((caught as Error).message);
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    void prepare();
    return () => {
      mounted.current = false;
      discardDone.current?.(false);
    };
  }, []);

  const guard = useRef(async () => true);
  guard.current = async () => {
    if (running.current) return false;
    if (!dirty) return true;
    if (discardDone.current) return false;
    setDiscard(true);
    return new Promise<boolean>((resolve) => {
      discardDone.current = resolve;
    });
  };
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current(), {
      protected: dirty || busy,
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || running.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      registerNavigationGuard?.(null);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, busy, registerNavigationGuard]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [discard]);
  async function close() {
    if (await guard.current()) latest.current.onFinish(false);
  }
  async function save() {
    if (!workspace || !dirty || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      if (snapshot.current !== updateSelectionSnapshot(latest.current.data)) {
        setStale(true);
        throw new Error(
          "Updates, audiences or membership changed. Refresh to review the current selection.",
        );
      }
      const actions = updateSelectionActions(workspace, target, selected);
      if (actions.length) await latest.current.onLearningMany(actions);
      notify("Update recommendations saved.");
      latest.current.onFinish(true);
    } catch (caught) {
      if (!isOrganizationChangeCanceled(caught)) {
        setError((caught as Error).message);
        // Relationship writes may have partially succeeded; refresh before retrying.
        setStale(true);
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const options = workspace ? updateSelectionOptions(workspace, target) : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent
        size="assignment"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          heading.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          void close();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          void close();
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="grid gap-2">
            <DialogTitle ref={heading} tabIndex={-1}>
              {discard
                ? "Discard recommendation changes?"
                : "Update recommendations"}
            </DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label="Close Update recommendations"
            onClick={() => void close()}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <DialogBody className="flex flex-col gap-3">
          {error && (
            <div className="grid shrink-0 gap-2">
              <Alert variant="destructive">{error}</Alert>
              {stale && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void prepare(true)}
                >
                  Refresh recommendations
                </Button>
              )}
              {!workspace && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void prepare()}
                >
                  Try again
                </Button>
              )}
            </div>
          )}
          {discard ? (
            <p className="text-sm text-muted-foreground">
              Your unsaved selections will be discarded.
            </p>
          ) : (
            <>
              <p className="shrink-0 text-sm text-muted-foreground">
                {target.kind === "audiences"
                  ? "Choose Updates to recommend in For you."
                  : "Choose groups that receive this Update in For you."}{" "}
                No completion requirement.
              </p>
              {!workspace ? (
                <p role="status">
                  {busy
                    ? "Loading recommendations…"
                    : "Recommendations could not be loaded."}
                </p>
              ) : (
                <AssignmentTransfer
                  key={generation}
                  options={options}
                  value={selected}
                  onChange={setSelected}
                  disabled={busy || stale}
                  removing={target.mode === "remove"}
                  rightLabel={
                    complete
                      ? "Assigned"
                      : target.mode === "remove"
                        ? "To remove"
                        : "To add"
                  }
                  searchPlaceholder={
                    target.kind === "items" ? "Find groups" : "Find Updates"
                  }
                  emptyMessage="No matching Updates or audiences."
                />
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {discard ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDiscard(false);
                  discardDone.current?.(false);
                  discardDone.current = null;
                }}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                onClick={() => {
                  discardDone.current?.(true);
                  discardDone.current = null;
                  latest.current.onFinish(false);
                }}
              >
                Discard changes
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void close()}
              >
                Cancel
              </Button>
              <SaveChangesControl
                dirty={dirty}
                busy={busy}
                blockedReason={stale ? "Refresh before saving." : undefined}
                onClick={() => void save()}
              >
                Review changes
              </SaveChangesControl>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
