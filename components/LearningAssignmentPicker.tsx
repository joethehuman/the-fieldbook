"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { LearningItem } from "@/lib/types";
import { ContentSelectionList } from "./patterns/content-selection-list";
import { SearchableSelectionList } from "./patterns/searchable-selection-list";
import {
  applyLearningSelection,
  learningSelectionOptions,
  selectedLearningItems,
  type LearningAssignmentTarget,
} from "@/lib/learning-assignment-selection";
import { expandLearning } from "@/lib/learning-groups";
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
  DialogSteps,
} from "./ui/dialog";
import { LearningAudienceReview } from "./LearningAudienceReview";
import { X } from "lucide-react";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";

export function LearningAssignmentPicker({
  data,
  item,
  title,
  onChange,
  registerNavigationGuard,
  onPrepare,
  triggerLabel = "Edit audience",
  compact = false,
  draftAudiences,
  onDraftChange,
  showPeople = true,
  target,
  onFinish,
}: {
  onPrepare?: () => Promise<Workspace | null>;
  triggerLabel?: string;
  compact?: boolean;
  data: Workspace;
  onFinish?: (saved: boolean, error?: Error) => void;
  draftAudiences?: string[];
  showPeople?: boolean;
  onDraftChange?: (keys: string[]) => void;
  title: string;
  onChange?: (
    next: Workspace,
    options?: OrganizationChangeOptions,
  ) => void | Promise<void>;
  registerNavigationGuard?: RegisterNavigationGuard;
} & (
  | { item: LearningItem | { kind: "brief"; id: string }; target?: never }
  | { item?: never; target: LearningAssignmentTarget }
)) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false),
    [step, setStep] = useState<"select" | "review" | "discard">("select"),
    [reviewPlan, setReviewPlan] = useState<{
      before: Workspace;
      after: Workspace;
      stamp: string;
    } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const reviewDone = useRef<((accepted: boolean) => void) | null>(null);
  const discardDone = useRef<((accepted: boolean) => void) | null>(null);
  const previousStep = useRef<"select" | "review">("select");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    body.current?.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reviewDone.current?.(false);
      discardDone.current?.(false);
    };
  }, []);
  const initial = useRef<string[]>([]),
    revision = useRef<number | undefined>(undefined),
    snapshot = useRef(""),
    running = useRef(false),
    refreshing = useRef(false);
  const notify = useToast();
  const dirty =
    open &&
    JSON.stringify([...selected].sort()) !==
      JSON.stringify([...initial.current].sort());
  const guard = useRef(async () => true);
  guard.current = async () => {
    if (running.current || refreshing.current) return false;
    if (!dirty) return true;
    if (discardDone.current) return false;
    previousStep.current = step === "review" ? "review" : "select";
    setStep("discard");
    const accepted = await new Promise<boolean>((done) => {
      discardDone.current = done;
    });
    if (accepted) {
      reviewDone.current?.(false);
      reviewDone.current = null;
      setOpen(false);
    }
    return accepted;
  };
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
  const learningItem = item && item.kind !== "brief" ? item : undefined;
  const learningItems = target
    ? selectedLearningItems(target, selected)
    : learningItem
      ? [learningItem]
      : [];
  const selectionOptions = useMemo(
    () => (target ? learningSelectionOptions(data, target) : []),
    [data, target],
  );
  const returnFocus = useRef<HTMLElement | null>(null);
  const inherited = Object.fromEntries(
    allAudiences.flatMap((candidate) => {
      const key = audienceKey(candidate);
      const sources = learningItems.flatMap((learning) =>
        curriculumAudienceSources(data, key, learning),
      );
      return sources.length ? [[key, sources]] : [];
    }),
  );
  const selectedCourseIds = new Set(
    expandLearning(learningItems, data.curricula || []),
  );
  const existingAudienceKeys =
    target?.kind === "items"
      ? allAudiences
          .filter((audience) =>
            expandLearning(audience.items, data.curricula || []).some((id) =>
              selectedCourseIds.has(id),
            ),
          )
          .map(audienceKey)
      : undefined;
  const draftKeys = showPeople
    ? draftAudiences
    : draftAudiences?.filter((key) => key.startsWith("group:"));
  const initialKeys =
    draftKeys ||
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
        "Teams, groups, membership or learning changed. Refresh to review the current consequences.",
      );
    }
  };
  async function close() {
    if (await guard.current()) {
      reviewDone.current?.(false);
      reviewDone.current = null;
      setOpen(false);
      setError("");
      onFinish?.(false);
    }
  }
  async function save() {
    if (running.current || refreshing.current) return;
    if (data.governanceRevision !== revision.current) {
      setStale(true);
      setError(
        "Teams, groups or membership changed. Refresh to review the current consequences.",
      );
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      validateCurrent();
      if (item?.kind === "brief") {
        if (!onDraftChange)
          throw new Error("Update audience editing is unavailable.");
        onDraftChange(selected);
      } else {
        if (!onChange) throw new Error("Assignment saving is unavailable.");
        await onChange(
          target
            ? applyLearningSelection(dataRef.current, target, selected)
            : assignLearningToAudiences(
                dataRef.current,
                learningItems,
                selected,
              ),
          {
            locallyHandled: true,
            validateCurrent,
            review: {
              confirm: async (before, after) => {
                validateCurrent();
                running.current = false;
                setBusy(false);
                setReviewPlan({
                  before,
                  after,
                  stamp: new Date().toISOString(),
                });
                setStep("review");
                const accepted = await new Promise<boolean>((done) => {
                  reviewDone.current = done;
                });
                reviewDone.current = null;
                if (accepted) {
                  running.current = true;
                  setBusy(true);
                }
                return accepted;
              },
            },
          },
        );
      }
      initial.current = selected;
      setOpen(false);
      notify(
        item?.kind === "brief"
          ? "Audience updated in draft. Publish to update recommendations."
          : "Assignments saved. Existing history and deadlines preserved.",
      );
      onFinish?.(true);
    } catch (e) {
      if (!isOrganizationChangeCanceled(e)) {
        if (e instanceof SaveRecoveryError) setStale(true);
        setError((e as Error).message);
      }
    } finally {
      running.current = false;
      if (!refreshing.current) setBusy(false);
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
      if (!prepared || !mounted.current) {
        onFinish?.(false);
        return;
      }
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const ids = target
        ? []
        : item?.kind === "brief"
          ? draftKeys || []
          : learningItem
            ? directlyAssignedAudiences(prepared, learningItem)
            : [];
      initial.current = ids;
      revision.current = prepared.governanceRevision;
      snapshot.current = assignmentSnapshot(prepared);
      setSelected(target?.kind === "audiences" ? target.selected || [] : ids);
      setStep("select");
      setReviewPlan(null);
      setOpen(true);
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        onFinish?.(false, e as Error);
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function refresh() {
    refreshing.current = true;
    running.current = true;
    reviewDone.current?.(false);
    reviewDone.current = null;
    setBusy(true);
    try {
      const latest = onPrepare ? await onPrepare() : dataRef.current;
      if (!latest || !mounted.current) return;
      revision.current = latest.governanceRevision;
      snapshot.current = assignmentSnapshot(latest);
      initial.current =
        item?.kind === "brief"
          ? draftKeys || []
          : target
            ? []
            : learningItem
              ? directlyAssignedAudiences(latest, learningItem)
              : [];
      setStale(false);
      setError("");
      setReviewPlan(null);
      setStep("select");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      refreshing.current = false;
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (target) void begin();
  }, [target]);
  return (
    <>
      {!target && (
        <Button
          type="button"
          variant={compact ? "link" : "outline"}
          size={compact ? "sm" : "default"}
          loading={busy && !open}
          onClick={() => void begin()}
        >
          {triggerLabel}
        </Button>
      )}
      {!open && error && <Alert variant="destructive">{error}</Alert>}
      {!compact && !target && (
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
        <DialogContent
          size="workflow"
          onCloseAutoFocus={(event) => {
            if (target && returnFocus.current?.isConnected) {
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
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            heading.current?.focus({ preventScroll: true });
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-4">
            <div className="grid gap-2">
              <DialogTitle ref={heading} tabIndex={-1}>
                {target
                  ? target.kind === "audiences"
                    ? "Assign Courses"
                    : "Learning audience"
                  : item?.kind === "brief"
                    ? "Update audience"
                    : item?.kind === "curriculum"
                      ? "Curriculum audience"
                      : "Course audience"}
              </DialogTitle>
              <DialogDescription>{title}</DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close audience editor"
              disabled={busy}
              onClick={() => void close()}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          {item?.kind !== "brief" && (
            <DialogSteps
              steps={[
                target?.kind === "audiences"
                  ? "Select learning"
                  : "Select audience",
                "Review changes",
              ]}
              current={step === "review" ? 1 : 0}
            />
          )}
          <DialogBody
            ref={body}
            className="overflow-y-auto [scrollbar-gutter:stable]"
          >
            {error && (
              <div className="mb-4 grid gap-3">
                <Alert variant="destructive">{error}</Alert>
                {stale && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void refresh()}
                  >
                    Refresh audience
                  </Button>
                )}
              </div>
            )}
            <div hidden={step !== "select"} className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {target
                  ? target.mode === "remove"
                    ? "Remove selected direct links. Other teams, groups and curricula can still supply this learning."
                    : target.kind === "audiences"
                      ? "Choose courses or curricula for this audience. Other assignments stay in place."
                      : "Add audiences for the selected learning. Other assignments stay in place."
                  : item?.kind === "brief"
                    ? "Choose who gets this Update in For you. No completion requirement."
                    : "Choose who gets this learning in For you and assigned learning."}
              </p>
              {target?.kind === "audiences" ? (
                <ContentSelectionList
                  bounded
                  label="Find courses or curricula"
                  showTypeFilter
                  disabled={busy || stale}
                  options={selectionOptions.flatMap((option) =>
                    option.type ? [{ ...option, type: option.type }] : [],
                  )}
                  value={selected}
                  onChange={setSelected}
                />
              ) : target?.mode === "remove" ? (
                <SearchableSelectionList
                  label="Find a team or group"
                  options={selectionOptions}
                  value={selected}
                  onChange={setSelected}
                  disabled={busy || stale}
                />
              ) : (
                <AudienceSelection
                  recommendationsOnly={item?.kind === "brief"}
                  data={data}
                  selected={selected}
                  initialSelected={initial.current}
                  existingAudienceKeys={existingAudienceKeys}
                  onChange={setSelected}
                  disabled={busy || stale}
                  inherited={target ? undefined : inherited}
                  showPeople={showPeople}
                />
              )}
            </div>
            {step === "review" && reviewPlan && learningItems.length > 0 && (
              <LearningAudienceReview
                key={reviewPlan.stamp}
                before={reviewPlan.before}
                after={reviewPlan.after}
                item={learningItems}
                showLearningTitles={target?.kind === "audiences"}
                stamp={reviewPlan.stamp}
              />
            )}
            {step === "discard" && (
              <div className="grid gap-3">
                <h3 className="text-lg font-medium">
                  Discard audience changes?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Your saved audience will stay as it is.
                </p>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {step === "discard" ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    discardDone.current?.(false);
                    discardDone.current = null;
                    setStep(previousStep.current);
                  }}
                >
                  Keep editing
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    discardDone.current?.(true);
                    discardDone.current = null;
                    onFinish?.(false);
                  }}
                >
                  Discard changes
                </Button>
              </>
            ) : (
              <>
                {step === "review" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      reviewDone.current?.(false);
                      setStep("select");
                    }}
                  >
                    ← Back
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void close()}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  loading={busy}
                  disabled={!dirty || stale || (target && !selected.length)}
                  onClick={() => {
                    if (step === "review") {
                      running.current = true;
                      setBusy(true);
                      reviewDone.current?.(true);
                    } else void save();
                  }}
                >
                  {item?.kind === "brief"
                    ? "Apply to draft"
                    : step === "review"
                      ? "Save assignments"
                      : "Review changes"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
