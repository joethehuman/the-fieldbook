import { defaultSettings, publicSettings } from "./settings";
import type { Workspace } from "./store";
import { ancestorIds, effectiveGroups, type User, type Group } from "./types";
import { requiredSequence } from "./learning";
import { groupItems } from "./learning-groups";

export const guest: User = {
  id: "guest",
  name: "Guest",
  email: "",
  role: "learner",
  groups: [],
  active: true,
};

/** A recommendation projection, never an account or governance membership.
 * Resolve real hierarchy on the server, then discard its identity and timing data.
 * The demo uses the same projection without persisting its synthetic group/user.
 */
export function guestRecommendations(
  data: Pick<Workspace, "settings" | "groups" | "curricula" | "content">,
) {
  const settings = { ...defaultSettings, ...data.settings };
  const selected =
    settings.access === "public"
      ? data.groups.find((g) => g.id === settings.guestGroupId)
      : undefined;
  const user: User = {
    ...guest,
    groups: selected ? ["guest-recommendations"] : [],
  };
  const sourceUser = { ...guest, groups: selected ? [selected.id] : [] };
  const effective = effectiveGroups(sourceUser, data.groups);
  const published =
    settings.access === "public"
      ? data.content.filter((c) => c.status === "published")
      : [];
  const curricula =
    settings.access === "public"
      ? (data.curricula || [])
          .filter((c) => c.status === "published")
          .map((c) => ({
            ...c,
            courseIds: c.courseIds.filter((id) =>
              published.some((d) => d.id === id && d.kind === "course"),
            ),
          }))
      : [];
  const sequence = requiredSequence(published, sourceUser, data.groups);
  const courseIds = new Set(sequence.map((c) => c.id));
  const items = data.groups
    .filter((g) => effective.has(g.id))
    .sort(
      (a, b) =>
        ancestorIds(a.id, data.groups).size -
          ancestorIds(b.id, data.groups).size || a.name.localeCompare(b.name),
    )
    .flatMap((g) => groupItems(g, published))
    .filter((i) =>
      i.kind === "course"
        ? courseIds.has(i.id)
        : curricula.some((c) => c.id === i.id),
    );
  const groups: Group[] = selected
    ? [
        {
          id: "guest-recommendations",
          name: "Guest recommendations",
          requiredCourseIds: sequence.map((c) => c.id),
          learningItems: items.filter(
            (i, index) =>
              items.findIndex((x) => x.kind === i.kind && x.id === i.id) ===
              index,
          ),
        },
      ]
    : [];
  const content = published.map((c) => ({
    ...c,
    groups: (
      c.kind === "course"
        ? courseIds.has(c.id)
        : c.kind === "brief" && c.groups.some((id) => effective.has(id))
    )
      ? ["guest-recommendations"]
      : [],
    // Legacy group-only assignment rules preserve matching without real dates or IDs.
    assignments: undefined,
  }));
  return {
    user,
    groups,
    content,
    curricula,
    settings: publicSettings(settings),
  };
}
