"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { LearningItem } from "@/lib/types";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import {
  assignmentAudiences,
  audienceKey,
  learningChangeImpact,
  directlyAssignedAudiences,
  curriculumAudienceSources,
  assignLearningToAudiences,
} from "@/lib/assignment-audiences";
import { SearchableSelectionList } from "./patterns/searchable-selection-list";
import { SectionHeader } from "./patterns/layout";
import { Button } from "./ui/button";
import { Alert } from "./ui/alert";
import { ActionGroup } from "./ui/action-group";
import { useToast } from "./ui/toast";
import { useInteractionDialog } from "./ui/interaction-dialog";

export function LearningAssignmentPicker({
  data,
  item,
  onChange,
  onCancel,
  registerNavigationGuard,
}: {
  data: Workspace;
  item: LearningItem;
  onChange: (data: Workspace) => void | Promise<void>;
  onCancel: () => void;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const [selected, setSelected] = useState(() =>
    directlyAssignedAudiences(data, item),
  );
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initial = useRef(selected);
  const reviewedRevision = useRef(data.governanceRevision);
  const dirty =
    [...selected].sort().join("\n") !== [...initial.current].sort().join("\n");
  const notify = useToast(),
    { confirm } = useInteractionDialog();
  const guard = useRef(async () => true);
  guard.current = async () =>
    !busy && (!dirty || (await confirm("Discard unsaved assignment changes?")));
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current(), {
      protected: dirty || busy,
    });
    return () => registerNavigationGuard?.(null);
  }, [registerNavigationGuard, dirty, busy]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);
  const review = useMemo(() => {
    try {
      return {
        rows: learningChangeImpact(
          data,
          assignLearningToAudiences(data, [item], selected),
        ),
        error: "",
      };
    } catch (failure) {
      return { rows: [], error: (failure as Error).message };
    }
  }, [data, item.kind, item.id, selected]);
  const impact = review.rows;
  const stale = data.governanceRevision !== reviewedRevision.current;
  return (
    <section aria-label="Assign learning" className="grid gap-4">
      <SectionHeader
        title={<h2>Assign to teams or groups</h2>}
        description="Teams include their subteams. Groups provide custom assignment audiences. Each course counts once, even when several audiences assign it."
      />
      {(error || review.error || stale) && (
        <Alert variant="destructive">
          {error ||
            review.error ||
            "Organization data changed. Close and reopen the picker to review current assignments."}
        </Alert>
      )}
      <SearchableSelectionList
        label="Find a team or group"
        placeholder="Find a team or group"
        emptyMessage="No matching teams or groups."
        disabled={busy}
        value={selected}
        onChange={setSelected}
        options={assignmentAudiences(data).map((a) => {
          const key = audienceKey(a),
            curricula = curriculumAudienceSources(data, key, item);
          return {
            id: key,
            label: `${a.kind === "team" ? "Team" : "Group"}: ${a.name}`,
            description: curricula.length
              ? `Also assigned through: ${curricula.join(", ")}. Removing the direct link keeps these curriculum assignments.`
              : undefined,
          };
        })}
      />
      <div className="grid gap-2 text-copy" aria-label="Assignment impact">
        <p>
          {impact.filter((row) => row.gained.length).length} people gain courses
          · {impact.filter((row) => row.lost.length).length} people lose courses
          · {impact.filter((row) => row.changed.length).length} people keep
          courses with changed sources.
        </p>
        <p>
          Continuing assignments keep their deadlines. New coverage starts a new
          completion window. Saved course progress is preserved.
        </p>
        {!!impact.length && (
          <details>
            <summary>Review affected people ({impact.length})</summary>
            <ul>
              {impact.slice(0, 10).map((row) => (
                <li key={row.person.id}>
                  {row.person.name}: {row.gained.length} added,{" "}
                  {row.lost.length} removed, {row.changed.length} source changes
                </li>
              ))}
            </ul>
            {impact.length > 10 && (
              <p>Showing the first 10 of {impact.length} affected people.</p>
            )}
          </details>
        )}
      </div>
      <ActionGroup>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (await guard.current()) onCancel();
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!!review.error || stale}
          loading={busy}
          onClick={async () => {
            if (running.current) return;
            running.current = true;
            setBusy(true);
            setError("");
            try {
              if (data.governanceRevision !== reviewedRevision.current)
                throw new Error(
                  "Organization data changed. Close and reopen the picker to review current assignments before saving.",
                );
              await onChange(assignLearningToAudiences(data, [item], selected));
              initial.current = selected;
              notify(
                "Assignments saved. Existing course history and deadlines preserved.",
              );
              onCancel();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              running.current = false;
              setBusy(false);
            }
          }}
        >
          Save assignments
        </Button>
      </ActionGroup>
    </section>
  );
}
