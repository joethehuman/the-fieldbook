"use client";
import { FormField } from "@/components/patterns/form-field";
import { Alert } from "./ui/alert";
import { useToast } from "./ui/toast";
import { CsvExport } from "./patterns/csv-export";
import { courseProgressRow, courseProgressCsv } from "@/lib/reporting";
import { DataTable } from "./patterns/data-table";
import { Input } from "@/components/ui/input";

import { SectionHeader, EmptyState } from "@/components/patterns/layout";
import { ActionGroup } from "@/components/ui/action-group";
import {
  TableContainer,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Workspace } from "@/lib/store";
import { groupPath } from "@/lib/group-hierarchy";
import {
  ancestorIds,
  effectiveGroups,
  isComplete,
  type Content,
} from "@/lib/types";
import {
  assignmentRules,
  learningState,
  type LearningAction,
} from "@/lib/learning";
export type LearningHandler = (action: LearningAction) => Promise<void>;
type Scope = { groupId?: string; userId?: string; courseId?: string };
export function Assignments({
  data,
  scope = {},
  onAction,
  onOpenGroup,
  onChange,
}: {
  data: Workspace;
  scope?: Scope;
  onAction: LearningHandler;
  onOpenGroup?: (id: string) => void;
  onChange?: (data: Workspace) => void | Promise<void>;
}) {
  const notify = useToast();
  const { confirm } = useInteractionDialog();
  const [selected, setSelected] = useState(
      scope.groupId || data.groups[0]?.id || "",
    ),
    [courseId, setCourseId] = useState(scope.courseId || ""),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reportError, setReportError] = useState(false),
    [detail, setDetail] = useState<string | null>(null);
  const groupId = scope.groupId || selected,
    group = data.groups.find((g) => g.id === groupId),
    person = data.users.find((u) => u.id === scope.userId);
  const courses = (data.publishedContent ?? data.content).filter(
    (c) => c.kind === "course" && c.status === "published",
  );
  const state = person
    ? learningState(
        courses,
        person,
        data.groups,
        data.progress[person.id] || [],
        data.settings,
      )
    : null;
  const required = person
    ? state!.required
    : courses.filter((c) =>
        assignmentRules(c).some(
          (a) => a.groupId && ancestorIds(groupId, data.groups).has(a.groupId),
        ),
      );
  const ids = group?.requiredCourseIds || [];
  const direct = courses
    .filter((c) => assignmentRules(c).some((a) => a.groupId === groupId))
    .sort((a, b) => {
      const ai = ids.indexOf(a.id),
        bi = ids.indexOf(b.id);
      return (
        (ai < 0 ? 99999 : ai) - (bi < 0 ? 99999 : bi) ||
        a.title.localeCompare(b.title)
      );
    });
  const ordered = person
    ? required
    : [
        ...required
          .filter((c) => !direct.some((d) => d.id === c.id))
          .sort((a, b) => a.title.localeCompare(b.title)),
        ...direct,
      ];
  const available = courses.filter(
    (c) =>
      (!scope.courseId || c.id === scope.courseId) &&
      !direct.some((d) => d.id === c.id),
  );
  const currentRevision = (c: Content) =>
    data.content.find((d) => d.id === c.id)?.revision || c.revision || 1;
  async function act(action: LearningAction) {
    setBusy(true);
    setNotice("");
    try {
      await onAction(action);
      setReportError(false);
      setNotice("");
      notify(
        action.operation === "assign"
          ? "Assigned courses updated."
          : action.operation === "unassign"
            ? "Assignment removed. Course history preserved."
            : action.operation === "complete"
              ? "Course marked complete."
              : "Progress reset.",
      );
    } catch (e) {
      setReportError(true);
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function move(c: Content, offset: number) {
    if (!group || !onChange) return;
    const order = direct.map((c) => c.id),
      i = order.indexOf(c.id);
    [order[i], order[i + offset]] = [order[i + offset], order[i]];
    setBusy(true);
    try {
      await onChange({
        ...data,
        groups: data.groups.map((g) =>
          g.id === group.id ? { ...g, requiredCourseIds: order } : g,
        ),
      });
      setReportError(false);
      setNotice("");
      notify("Recommended order saved.");
    } catch (e) {
      setReportError(true);
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const peopleFor = (c: Content) =>
    person
      ? [person]
      : data.users.filter(
          (u) =>
            effectiveGroups(u, data.groups).has(groupId) &&
            assignmentRules(c).some(
              (a) =>
                a.groupId && effectiveGroups(u, data.groups).has(a.groupId),
            ),
        );
  const disabledReason = busy
    ? "Updating report…"
    : reportError
      ? "Reload the report before exporting after a failed change."
      : undefined;
  const rows = ordered
    .filter(
      (c) =>
        (!scope.courseId || c.id === scope.courseId) &&
        c.title.toLowerCase().includes(query.toLowerCase()),
    )
    .map((c) => {
      const sources = assignmentRules(c).filter(
        (a) =>
          a.groupId &&
          (person
            ? effectiveGroups(person, data.groups).has(a.groupId)
            : ancestorIds(groupId, data.groups).has(a.groupId)),
      );
      const people = peopleFor(c);
      return {
        c,
        sources,
        people,
        completed: people.filter((u) =>
          isComplete(c, data.progress[u.id] || []),
        ).length,
        sourceLabels: sources.map(
          (a) =>
            `${data.groups.find((g) => g.id === a.groupId)?.name || ""}${a.groupId !== groupId && !person ? " · inherited" : ""}`,
        ),
      };
    });
  const progressTable = (c: Content, optional = false) => {
    const progressRows = peopleFor(c).map((u) => courseProgressRow(data, u, c));
    return (
      <section className="grid gap-4">
        <SectionHeader
          title={<h3>{c.title}</h3>}
          description={optional ? "Optional course" : undefined}
        >
          <CsvExport
            disabledReason={disabledReason}
            filename={`${person?.name || group?.name || "group"}-${c.title}-progress`}
            report={() => courseProgressCsv(progressRows)}
          />
        </SectionHeader>
        <TableContainer>
          <DataTable layout="assignments">
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Course status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {progressRows.map(({ u, p, done, target, status, progress }) => {
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      {u.name}
                      <small>{u.email}</small>
                    </TableCell>
                    <TableCell>
                      {status}
                      {!done && target && <small>Target {target}</small>}
                    </TableCell>
                    <TableCell>{progress}</TableCell>
                    <TableCell>
                      <ActionGroup>
                        <Button
                          variant="ghost"
                          disabled={busy || done}
                          onClick={async () => {
                            if (
                              await confirm(
                                `Mark ${c.title} complete for ${u.name}?`,
                              )
                            )
                              void act({
                                operation: "complete",
                                contentId: c.id,
                                expected: currentRevision(c),
                                userId: u.id,
                                version: c.version,
                                progressExpected: p?.revision || 0,
                              });
                          }}
                        >
                          Mark complete
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy || !p}
                          onClick={async () => {
                            if (
                              await confirm(
                                `Reset lessons, quiz attempts and completion for ${u.name} on ${c.title}? Previous state is retained in the audit record.`,
                              )
                            )
                              void act({
                                operation: "reset",
                                contentId: c.id,
                                expected: currentRevision(c),
                                userId: u.id,
                                version: c.version,
                                progressExpected: p?.revision || 0,
                              });
                          }}
                        >
                          Reset progress
                        </Button>
                      </ActionGroup>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
        </TableContainer>
      </section>
    );
  };
  return (
    <section className="assignments-panel">
      <SectionHeader
        title={<h2>{person ? "Courses & progress" : "Assigned courses"}</h2>}
        description={
          <>
            {person
              ? `${state!.status}${state!.onboarding ? ` · Onboarding target ${state!.target}` : ""}. Assigned courses come from group membership.`
              : "Choose the courses each group needs, then put it in a recommended order. Parent-group foundations come first; courses are never locked."}
          </>
        }
      >
        <CsvExport
          disabledReason={disabledReason}
          filename={`${person?.name || group?.name || "group"}-assigned-courses`}
          report={() => ({
            headings: [
              "Learning group",
              "Person",
              "Email",
              "Course",
              "Published version",
              "Assigned through",
              "Completed people",
              "Total people",
            ],
            rows: rows.map(({ c, sourceLabels, completed, people }) => [
              person ? "" : group?.name,
              person?.name,
              person?.email,
              c.title,
              c.version,
              sourceLabels.join("; "),
              completed,
              people.length,
            ]),
          })}
        />
      </SectionHeader>
      {!person && !scope.groupId && (
        <FormField label="Group">
          <SelectField
            value={selected}
            onValueChange={(value) => {
              setSelected(value);
              setDetail(null);
            }}
          >
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {groupPath(g.id, data.groups)}
              </option>
            ))}
          </SelectField>
        </FormField>
      )}
      {!person && group && (
        <form
          className="assignment-filters"
          onSubmit={(e) => {
            e.preventDefault();
            const c = available.find((c) => c.id === courseId) || available[0];
            if (c)
              void act({
                operation: "assign",
                contentId: c.id,
                expected: currentRevision(c),
                groupId,
                due: { type: "none" },
              });
          }}
        >
          <FormField label="Add course">
            <SelectField
              value={
                available.some((c) => c.id === courseId)
                  ? courseId
                  : available[0]?.id || ""
              }
              onValueChange={(value) => setCourseId(value)}
              disabled={!available.length}
            >
              {available.length ? (
                available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))
              ) : (
                <option value="">No additional published courses</option>
              )}
            </SelectField>
          </FormField>
          <Button variant="default" disabled={busy || !available.length}>
            <Plus aria-hidden="true" />
            Add to assigned courses
          </Button>
        </form>
      )}
      {!person && !group && (
        <p>Create a group to define its assigned courses.</p>
      )}
      <p className="muted">
        {data.settings?.onboardingDays ?? 90} days for new users ·{" "}
        {data.settings?.catchUpDays ?? 30} days to catch up with new assigned
        courses. Manage these windows in Settings.
      </p>
      {notice && <Alert variant="destructive">{notice}</Alert>}
      <FormField label="Find a course">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assigned courses"
        />
      </FormField>
      <TableContainer>
        <DataTable layout="courses">
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Assigned through</TableHead>
              <TableHead>Completion</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ c, sources, sourceLabels, completed, people }) => {
              const local = sources.some((a) => a.groupId === groupId),
                index = direct.findIndex((d) => d.id === c.id);
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Button
                      variant="link"
                      onClick={() => setDetail(detail === c.id ? null : c.id)}
                    >
                      {c.title}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {sourceLabels.map((label, i) => (
                      <div key={i}>{label}</div>
                    ))}
                  </TableCell>
                  <TableCell>
                    {completed} of {people.length} complete
                  </TableCell>
                  <TableCell>
                    <ActionGroup>
                      <Button
                        variant="ghost"
                        onClick={() => setDetail(detail === c.id ? null : c.id)}
                      >
                        View progress
                      </Button>
                      {!person && local && (
                        <>
                          <Button
                            variant="ghost"
                            aria-label={`Move ${c.title} earlier`}
                            disabled={busy || index === 0 || !onChange}
                            onClick={() => move(c, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            aria-label={`Move ${c.title} later`}
                            disabled={
                              busy || index === direct.length - 1 || !onChange
                            }
                            onClick={() => move(c, 1)}
                          >
                            ↓
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await confirm(
                                  `Remove ${c.title} from ${group?.name} assigned courses? Progress and other group requirements are preserved.`,
                                )
                              )
                                void act({
                                  operation: "unassign",
                                  contentId: c.id,
                                  expected: currentRevision(c),
                                  groupId,
                                });
                            }}
                          >
                            Remove assignment
                          </Button>
                        </>
                      )}
                      {!person && !local && sources[0]?.groupId && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            onOpenGroup
                              ? onOpenGroup(sources[0].groupId!)
                              : setSelected(sources[0].groupId!)
                          }
                        >
                          Manage parent group
                        </Button>
                      )}
                    </ActionGroup>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
        {!rows.length && (
          <EmptyState>
            No assigned courses yet. The full library remains available.
          </EmptyState>
        )}
      </TableContainer>
      {detail && rows.some(({ c }) => c.id === detail) && (
        <section className="assignment-detail">
          {progressTable(courses.find((c) => c.id === detail)!)}
        </section>
      )}
      {person && (
        <>
          <h2>Course history</h2>
          {courses
            .filter(
              (c) =>
                !required.some((r) => r.id === c.id) &&
                (data.progress[person.id] || []).some(
                  (p) => p.content_id === c.id && p.version === c.version,
                ),
            )
            .map((c) => (
              <section key={c.id}>{progressTable(c, true)}</section>
            ))}
        </>
      )}
    </section>
  );
}
