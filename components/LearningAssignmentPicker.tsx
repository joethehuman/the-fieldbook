"use client";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { LearningItem } from "@/lib/types";
import { AudienceSelection } from "./patterns/audience-selection";
import { audienceOptions, contentAudienceKey } from "@/lib/content-audiences";
import {
  assignLearningToAudiences,
  curriculumAudienceSources,
  directlyAssignedAudiences,
  assignmentAudiences,
  audienceKey,
} from "@/lib/assignment-audiences";
import { SaveRecoveryError } from "@/lib/save-recovery";
import {
  isOrganizationChangeCanceled,
  type OrganizationChangeOptions,
} from "@/lib/organization-change";
import { Button } from "./ui/button";
import { Alert } from "./ui/alert";
import { useToast } from "./ui/toast";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./ui/dialog";
import { useInteractionDialog } from "./ui/interaction-dialog";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";

export function LearningAssignmentPicker({
  data,
  item,
  title,
  onChange,
  registerNavigationGuard,
  onPrepare,
  triggerLabel = "Assign to teams or groups",
  compact = false,
  draftAudiences,
  onDraftChange,
  showPeople = true,
}: {
  onPrepare?: () => Promise<Workspace | null>;
  triggerLabel?: string;
  compact?: boolean;
  data: Workspace;
  item: LearningItem | { kind: "brief"; id: string };
  draftAudiences?: string[];
  showPeople?: boolean;
  onDraftChange?: (keys: string[]) => void;
  title: string;
  onChange?: (
    next: Workspace,
    options?: OrganizationChangeOptions,
  ) => void | Promise<void>;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const initial = useRef<string[]>([]),
    revision = useRef<number | undefined>(undefined),
    snapshot = useRef(""),
    running = useRef(false);
  const { confirm } = useInteractionDialog();
  const notify = useToast();
  const dirty =
    open &&
    JSON.stringify([...selected].sort()) !==
      JSON.stringify([...initial.current].sort());
  const guard = useRef(async () => true);
  guard.current = async () =>
    !running.current &&
    (!dirty || (await confirm("Discard unsaved assignment changes?")));
  useEffect(() => {
    if (!open) return;
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
  }, [open, dirty, busy, registerNavigationGuard]);
  const allAudiences = assignmentAudiences(data);
  const learningItem = item.kind === "brief" ? undefined : item;
  const inherited = Object.fromEntries(
    allAudiences.flatMap((candidate) => {
      const key = audienceKey(candidate);
      const sources = learningItem
        ? curriculumAudienceSources(data, key, learningItem)
        : [];
      return sources.length ? [[key, sources]] : [];
    }),
  );
  const initialKeys =
    draftAudiences ||
    (learningItem ? directlyAssignedAudiences(data, learningItem) : []);
  const assignmentSnapshot = (workspace: Workspace) =>
    JSON.stringify([
      workspace.groups,
      workspace.teams,
      workspace.users,
      workspace.curricula,
      workspace.content,
      workspace.publishedContent,
      workspace.progress,
      workspace.settings,
      workspace.revision,
      workspace.governanceRevision,
    ]);
  const validateCurrent = () => {
    if (
      dataRef.current.governanceRevision !== revision.current ||
      assignmentSnapshot(dataRef.current) !== snapshot.current
    ) {
      setStale(true);
      throw new Error(
        "Teams, groups, membership or learning changed. Close this dialog and review the current list.",
      );
    }
  };
  async function close() {
    if (await guard.current()) {
      setOpen(false);
      setError("");
    }
  }
  async function save() {
    if (running.current) return;
    if (data.governanceRevision !== revision.current) {
      setStale(true);
      setError(
        "Teams, groups or membership changed. Close this dialog and review the current list.",
      );
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      validateCurrent();
      if (item.kind === "brief") {
        if (!onDraftChange)
          throw new Error("Update audience editing is unavailable.");
        onDraftChange(selected);
      } else {
        if (!onChange) throw new Error("Assignment saving is unavailable.");
        await onChange(
          assignLearningToAudiences(dataRef.current, [item], selected),
          {
            locallyHandled: true,
            validateCurrent,
            review: {
              title: `Assign ${title}`,
              confirmLabel: "Apply assignments",
              always: true,
            },
          },
        );
      }
      initial.current = selected;
      setOpen(false);
      notify(
        item.kind === "brief"
          ? "Audience updated in draft. Publish to update recommendations."
          : "Assignments saved. Existing history and deadlines preserved.",
      );
    } catch (e) {
      if (!isOrganizationChangeCanceled(e)) {
        if (e instanceof SaveRecoveryError) setStale(true);
        setError((e as Error).message);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function begin() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setStale(false);
    try {
      const prepared = onPrepare ? await onPrepare() : dataRef.current;
      if (!prepared || !mounted.current) return;
      const ids =
        item.kind === "brief"
          ? draftAudiences || []
          : directlyAssignedAudiences(prepared, item);
      initial.current = ids;
      revision.current = prepared.governanceRevision;
      snapshot.current = assignmentSnapshot(prepared);
      setSelected(ids);
      setOpen(true);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant={compact ? "link" : "outline"}
        size={compact ? "sm" : "default"}
        loading={busy && !open}
        onClick={() => void begin()}
      >
        {triggerLabel}
      </Button>
      {!open && error && <Alert variant="destructive">{error}</Alert>}
      {!compact && (
        <p className="text-sm text-muted-foreground">
          {initialKeys.length || Object.keys(inherited).length
            ? [...new Set([...initialKeys, ...Object.keys(inherited)])]
                .map((key) => {
                  const option = audienceOptions(data).find(
                    (a) => contentAudienceKey(a) === key,
                  );
                  return option?.organization
                    ? "Everyone in the organization"
                    : option?.publicGuests
                      ? "Public guests"
                      : option?.name || "Saved team audience";
                })
                .join(" · ")
            : "No audiences selected"}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) void close();
        }}
      >
        <DialogContent size="selection" className="max-w-4xl">
          <DialogTitle>Assign to teams or groups</DialogTitle>
          <DialogDescription>
            {title}. Choose who receives this content in For you. Teams include
            their subteams.
            {item.kind === "brief"
              ? " Updates have no completion requirement or due date. Apply to draft, then Publish to update recommendations."
              : " Courses count toward assigned learning; due dates follow organization settings. Existing curriculum assignments are retained."}
          </DialogDescription>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogBody className="overflow-y-auto">
            <AudienceSelection
              key={open ? "open" : "closed"}
              data={data}
              selected={selected}
              onChange={setSelected}
              disabled={busy || stale}
              inherited={inherited}
              showPeople={showPeople}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void close()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={busy}
              disabled={!dirty || stale}
              onClick={() => void save()}
            >
              {item.kind === "brief" ? "Apply to draft" : "Review assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
