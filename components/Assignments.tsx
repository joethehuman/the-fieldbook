"use client";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { useState } from "react";
import type { Workspace } from "@/lib/store";
import {
  ancestorIds,
  effectiveGroups,
  isComplete,
  type Content,
} from "@/lib/types";
import {
  assignmentRules,
  learningState,
  learningTarget,
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
  const { confirm } = useInteractionDialog();
  const [selected, setSelected] = useState(
      scope.groupId || data.groups[0]?.id || "",
    ),
    [courseId, setCourseId] = useState(scope.courseId || ""),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
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
      setNotice(
        action.operation === "assign"
          ? "Required courses updated."
          : action.operation === "unassign"
            ? "Requirement removed. Course history preserved."
            : action.operation === "complete"
              ? "Course marked complete."
              : "Progress reset.",
      );
    } catch (e) {
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
      setNotice("Recommended order saved.");
    } catch (e) {
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
  const progressTable = (c: Content) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Person</th>
            <th>Course status</th>
            <th>Progress</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {peopleFor(c).map((u) => {
            const p = (data.progress[u.id] || []).find(
                (p) => p.content_id === c.id && p.version === c.version,
              ),
              done = isComplete(c, data.progress[u.id] || []);
            const target = learningTarget(c, u, data.groups, data.settings);
            return (
              <tr key={u.id}>
                <td>
                  {u.name}
                  <small>{u.email}</small>
                </td>
                <td>
                  {done
                    ? "Current"
                    : target && target < new Date().toISOString().slice(0, 10)
                      ? "Needs attention"
                      : "On track"}
                  {!done && target && <small>Target {target}</small>}
                </td>
                <td>
                  {done
                    ? "Complete"
                    : `${p?.lessons.length || 0} of ${c.lessons.length} lessons`}
                </td>
                <td>
                  <div className="assignment-actions">
                    <button
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
                    </button>
                    <button
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
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="assignments-panel">
      <div className="assignment-heading">
        <div>
          <h2>{person ? "Courses & progress" : "Required courses"}</h2>
          <p className="muted">
            {person
              ? `${state!.status}${state!.onboarding ? ` · Onboarding target ${state!.target}` : ""}. Required courses come from group membership.`
              : "Choose the courses each group needs, then put it in a recommended order. Parent-group foundations come first; courses are never locked."}
          </p>
        </div>
      </div>
      {!person && !scope.groupId && (
        <label>
          Group
          <SelectField
            value={selected}
            onValueChange={(value) => {
              setSelected(value);
              setDetail(null);
            }}
          >
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectField>
        </label>
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
          <label>
            Add required course
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
          </label>
          <Button variant="default" disabled={busy || !available.length}>
            Add to required courses
          </Button>
        </form>
      )}
      {!person && !group && (
        <p>Create a group to define its required courses.</p>
      )}
      <p className="muted">
        {data.settings?.onboardingDays ?? 90} days for new users ·{" "}
        {data.settings?.catchUpDays ?? 30} days to catch up with new required
        courses. Manage these windows in Settings.
      </p>
      {notice && <p role="status">{notice}</p>}
      <label>
        Find a course
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search required courses"
        />
      </label>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Course</th>
              <th>Required through</th>
              <th>Completion</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ordered
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
                const local = sources.some((a) => a.groupId === groupId),
                  people = peopleFor(c),
                  index = direct.findIndex((d) => d.id === c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setDetail(detail === c.id ? null : c.id)}
                      >
                        {c.title}
                      </button>
                    </td>
                    <td>
                      {sources.map((a) => (
                        <div key={a.groupId}>
                          {data.groups.find((g) => g.id === a.groupId)?.name}
                          {a.groupId !== groupId && !person
                            ? " · inherited"
                            : ""}
                        </div>
                      ))}
                    </td>
                    <td>
                      {
                        people.filter((u) =>
                          isComplete(c, data.progress[u.id] || []),
                        ).length
                      }{" "}
                      of {people.length} complete
                    </td>
                    <td>
                      <div className="assignment-actions">
                        <button
                          onClick={() =>
                            setDetail(detail === c.id ? null : c.id)
                          }
                        >
                          View progress
                        </button>
                        {!person && local && (
                          <>
                            <button
                              aria-label={`Move ${c.title} earlier`}
                              disabled={busy || index === 0 || !onChange}
                              onClick={() => move(c, -1)}
                            >
                              ↑
                            </button>
                            <button
                              aria-label={`Move ${c.title} later`}
                              disabled={
                                busy || index === direct.length - 1 || !onChange
                              }
                              onClick={() => move(c, 1)}
                            >
                              ↓
                            </button>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  await confirm(
                                    `Remove ${c.title} from ${group?.name} required courses? Progress and other group requirements are preserved.`,
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
                              Remove requirement
                            </button>
                          </>
                        )}
                        {!person && !local && sources[0]?.groupId && (
                          <button
                            onClick={() =>
                              onOpenGroup
                                ? onOpenGroup(sources[0].groupId!)
                                : setSelected(sources[0].groupId!)
                            }
                          >
                            Manage parent group
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {!ordered.length && (
          <p className="empty">
            No required courses yet. The full library remains available.
          </p>
        )}
      </div>
      {detail && courses.find((c) => c.id === detail) && (
        <section className="assignment-detail">
          <h3>{courses.find((c) => c.id === detail)!.title}</h3>
          {progressTable(courses.find((c) => c.id === detail)!)}
        </section>
      )}
      {person && (
        <>
          <h3>Course history</h3>
          {courses
            .filter(
              (c) =>
                !required.some((r) => r.id === c.id) &&
                (data.progress[person.id] || []).some(
                  (p) => p.content_id === c.id && p.version === c.version,
                ),
            )
            .map((c) => (
              <section key={c.id}>
                <h4>{c.title} · Optional course</h4>
                {progressTable(c)}
              </section>
            ))}
        </>
      )}
    </section>
  );
}
