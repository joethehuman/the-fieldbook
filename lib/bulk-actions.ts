import { reconcileAssignments } from "./assignment-episodes";
import type { Workspace } from "./store";
import type { Content, User } from "./types";
import { availableDocSections } from "./docs-navigation";
import { validQuestion } from "./course-quiz";

export type BulkOperation =
  "publish" | "unpublish" | "category" | "section" | "delete" | "restore";
export type BulkRequest = {
  entity: "content" | "user";
  operation: BulkOperation;
  items: { id: string; expected: number }[];
  value?: string;
  governanceExpected?: number;
};
export type BulkResult = {
  id: string;
  status: "changed" | "unchanged" | "failed";
  message?: string;
};
export type BulkHandler = (request: BulkRequest) => Promise<BulkResult[]>;
export type DeletedItem = {
  id: string;
  entity: "content" | "user";
  name: string;
  kind?: Content["kind"];
  deletedAt: string;
  deletedBy: string;
  purgeAfter: string;
  revision: number;
  purging?: boolean;
  error?: string;
  // Browser demo only. Server recovery snapshots never enter the client.
  content?: Content;
  user?: User;
};
export const retentionMs = 30 * 24 * 60 * 60 * 1000;

/** Metadata changes never publish other draft edits or change learning/feed dates. */
export function metadataPatch(
  data: Workspace,
  item: Content,
  operation: string,
  value: string,
): Partial<Content> {
  if (operation === "category") {
    if (item.kind === "doc") throw new Error("Move Docs to a section instead.");
    const clean = value.trim();
    if (!clean || clean.length > 80)
      throw new Error("Enter a category of 1–80 characters.");
    const existing = data.content.find(
      (c) =>
        c.kind === item.kind &&
        c.category.toLowerCase() === clean.toLowerCase(),
    );
    if (!existing)
      throw new Error("Choose an existing category for this content type.");
    return { category: existing.category };
  }
  const sections = availableDocSections(
    data.content.filter((c) => c.kind === "doc"),
    data.settings?.docCategoryOrder,
    data.settings?.docSections,
  );
  const section = sections.find((s) => s.id === value);
  if (item.kind !== "doc" || !section)
    throw new Error("Choose an existing Docs section.");
  const parent = sections.find((s) => s.id === section.parentId);
  return {
    sectionId: section.id,
    category: parent?.name || section.name,
    folder: parent ? section.name : "",
  };
}

/** The browser demo uses the same recovery window; expiry runs when the demo is opened. */
export function expireDemoDeleted(
  data: Workspace,
  now = Date.now(),
): Workspace {
  const expired = (data.deletedItems || []).filter(
    (d) => Date.parse(d.purgeAfter) <= now,
  );
  if (!expired.length) return data;
  const next = structuredClone(data);
  for (const item of expired) {
    if (item.entity === "user") delete next.progress[item.id];
    else {
      Object.keys(next.progress).forEach((id) => {
        next.progress[id] = next.progress[id].filter(
          (p) => p.content_id !== item.id,
        );
      });
      next.curricula = next.curricula?.map((c) => ({
        ...c,
        courseIds: c.courseIds.filter((id) => id !== item.id),
      }));
      next.teams = next.teams?.map((t) => ({
        ...t,
        requiredCourseIds: t.requiredCourseIds?.filter((id) => id !== item.id),
        learningItems: t.learningItems?.filter(
          (i) => i.kind !== "course" || i.id !== item.id,
        ),
      }));
      next.groups = next.groups.map((g) => ({
        ...g,
        requiredCourseIds: g.requiredCourseIds?.filter((id) => id !== item.id),
        learningItems: g.learningItems?.filter(
          (i) => i.kind !== "course" || i.id !== item.id,
        ),
      }));
    }
    next.feedback = next.feedback?.filter((f) =>
      item.entity === "user" ? f.userId !== item.id : f.contentId !== item.id,
    );
  }
  next.deletedItems = next.deletedItems?.filter(
    (d) => Date.parse(d.purgeAfter) > now,
  );
  next.users = reconcileAssignments(data, next, new Date(now).toISOString());
  return next;
}

export function applyDemoBulk(
  before: Workspace,
  actor: User,
  request: BulkRequest,
  now = Date.now(),
) {
  const data = structuredClone(expireDemoDeleted(before, now));
  if (["category", "section"].includes(request.operation)) {
    const selected = request.items.map((i) =>
      data.content.find((c) => c.id === i.id),
    );
    if (
      selected.some((c) => !c) ||
      new Set(selected.map((c) => c?.kind)).size !== 1
    )
      throw new Error(
        "Select one content type to change its category or section.",
      );
  }
  const results: BulkResult[] = [];
  data.deletedItems ||= [];
  for (const target of request.items) {
    try {
      const deleted: DeletedItem | undefined = data.deletedItems.find(
        (d) => d.id === target.id && d.entity === request.entity,
      );
      if (request.operation === "restore") {
        if (!deleted || Date.parse(deleted.purgeAfter) <= now)
          throw new Error("The recovery window has ended.");
        if (deleted.revision !== target.expected)
          throw new Error("This item changed. Reload before retrying.");
        if (deleted.content)
          data.content.push({
            ...deleted.content,
            status: "draft",
            publishedRevision: undefined,
            revision: deleted.revision + 1,
          });
        if (deleted.user)
          data.users.push({
            ...deleted.user,
            active: false,
            role: "learner",
            groups: [],
            teamId: undefined,
          });
        data.deletedItems = data.deletedItems.filter((d) => d !== deleted);
      } else if (deleted && request.operation === "delete") {
        results.push({ id: target.id, status: "unchanged" });
        continue;
      } else if (request.entity === "content") {
        const item = data.content.find((c) => c.id === target.id);
        if (!item || (item.revision || 0) !== target.expected)
          throw new Error("This item changed. Reload before retrying.");
        if (request.operation === "delete") {
          data.deletedItems.push({
            id: item.id,
            entity: "content",
            name: item.title,
            kind: item.kind,
            content: item,
            revision: target.expected + 1,
            deletedAt: new Date(now).toISOString(),
            purgeAfter: new Date(now + retentionMs).toISOString(),
            deletedBy: actor.name,
          });
          data.content = data.content.filter((c) => c.id !== item.id);
          data.publishedContent = data.publishedContent?.filter(
            (c) => c.id !== item.id,
          );
        } else if (request.operation === "publish") {
          if (
            !item.title.trim() ||
            (item.kind === "course" &&
              (!item.lessons.length ||
                item.lessons.some(
                  (l) => !l.title.trim() || (!l.body.trim() && !l.videoUrl),
                ) ||
                item.questions.some((q) => !validQuestion(q))))
          )
            throw new Error("Complete this draft before publishing.");
          item.revision = target.expected + 1;
          item.publishedRevision = item.revision;
          item.status = "published";
          item.updatedAt = new Date(now).toISOString();
          data.publishedContent = [
            ...(data.publishedContent || []).filter((c) => c.id !== item.id),
            structuredClone(item),
          ];
        } else if (request.operation === "unpublish") {
          if (!item.publishedRevision) {
            results.push({ id: item.id, status: "unchanged" });
            continue;
          }
          item.revision = target.expected + 1;
          item.publishedRevision = undefined;
          item.status = "draft";
          data.publishedContent = data.publishedContent?.filter(
            (c) => c.id !== item.id,
          );
        } else {
          const patch = metadataPatch(
            data,
            item,
            request.operation,
            request.value || "",
          );
          if (
            Object.entries(patch).every(
              ([key, value]) => item[key as keyof Content] === value,
            )
          ) {
            results.push({ id: item.id, status: "unchanged" });
            continue;
          }
          if (request.operation === "section")
            patch.sectionOrder =
              Math.max(
                0,
                ...[...data.content, ...(data.publishedContent || [])]
                  .filter((c) => c.sectionId === patch.sectionId)
                  .map((c) => c.sectionOrder || 0),
              ) + 1;
          Object.assign(item, patch, { revision: target.expected + 1 });
          const live = data.publishedContent?.find((c) => c.id === item.id);
          if (live) {
            Object.assign(live, patch);
            if (item.publishedRevision === target.expected)
              item.publishedRevision = item.revision;
          }
        }
      } else {
        if (request.operation !== "delete")
          throw new Error("Unsupported account action.");
        const user = data.users.find((u) => u.id === target.id);
        if (!user) throw new Error("Account not found.");
        if (user.id === actor.id)
          throw new Error("You cannot delete your own account.");
        if (
          user.role === "admin" &&
          !data.users.some(
            (u) => u.id !== user.id && u.active && u.role === "admin",
          )
        )
          throw new Error("Keep an active administrator.");
        data.deletedItems.push({
          id: user.id,
          entity: "user",
          name: user.name,
          user,
          revision: 1,
          deletedAt: new Date(now).toISOString(),
          purgeAfter: new Date(now + retentionMs).toISOString(),
          deletedBy: actor.name,
        });
        data.users = data.users.filter((u) => u.id !== user.id);
        data.teams = data.teams?.map((team) => {
          if (team.managerId !== user.id) return team;
          const { managerId: _manager, ...unassigned } = team;
          return unassigned;
        });
      }
      results.push({ id: target.id, status: "changed" });
    } catch (e) {
      results.push({
        id: target.id,
        status: "failed",
        message: (e as Error).message,
      });
    }
  }
  if (results.some((result) => result.status === "changed"))
    data.users = reconcileAssignments(
      before,
      data,
      new Date(now).toISOString(),
      before.users.every((u) => !u.learningAssignments),
    );
  return { data, results };
}
