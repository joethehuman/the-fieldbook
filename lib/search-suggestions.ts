import { orderedDocs, type DocSection } from "./docs-navigation";
import { courseProgress } from "./course-progress";
import { requiredSequence } from "./learning";
import { updatesForUser } from "./learning-groups";
import { contentPath } from "./navigation";
import { searchLabels, type SearchDestination } from "./search";
import type { Content, Group, Progress, Team, User } from "./types";

export type SearchSuggestion = SearchDestination & {
  title: string;
  detail: string;
};
export type SearchSuggestionsProvider = (
  signal: AbortSignal,
) => Promise<SearchSuggestion[]>;
export type SearchBrowsePath = "/docs" | "/courses" | "/updates";

/** Small, deterministic shortcuts using existing published reader data. */
export function searchSuggestions({
  content,
  user,
  groups = [],
  teams = [],
  progress = [],
  docCategoryOrder = [],
  docSections = [],
}: {
  content: Content[];
  user?: User;
  groups?: Group[];
  teams?: Team[];
  progress?: Progress[];
  docCategoryOrder?: string[];
  docSections?: DocSection[];
}): SearchSuggestion[] {
  const published = content.filter((item) => item.status === "published");
  const suggestions: SearchSuggestion[] = [];
  const add = (item: Content, detail = searchLabels[item.kind]) => {
    if (
      suggestions.length === 4 ||
      suggestions.some((s) => s.contentId === item.id)
    )
      return;
    suggestions.push({
      contentId: item.id,
      kind: item.kind,
      title: item.title,
      href: contentPath(item.kind, item.id, item.title),
      lessonId: null,
      detail,
    });
  };
  const guest = !user || user.id === "guest";
  const sequence = user ? requiredSequence(published, user, groups) : [];
  const remaining = guest
    ? sequence
    : sequence.filter((course) => !courseProgress(course, progress).complete);
  // Keep the saved learning order within each activity bucket.
  if (!guest)
    remaining
      .filter((course) => courseProgress(course, progress).inProgress)
      .forEach((course) => add(course, "Continue course"));
  remaining.forEach((course) =>
    add(
      course,
      guest
        ? "Recommended course"
        : courseProgress(course, progress).inProgress
          ? "Continue course"
          : "Assigned course",
    ),
  );

  const { forYou, other } = updatesForUser(
    published,
    user || {
      id: "guest",
      name: "Guest",
      email: "",
      role: "learner",
      groups: [],
      active: true,
    },
    groups,
    teams,
  );
  forYou.forEach((item) => add(item));
  // Fill a fresh reader's list with a mixture of Updates and ordered Docs.
  [...forYou, ...other].slice(0, 2).forEach((item) => add(item));
  const docs = orderedDocs(published, docCategoryOrder, docSections);
  for (const doc of docs) {
    const item = published.find((item) => item.id === doc.id);
    if (item) add(item);
    if (suggestions.length === 4) break;
  }
  if (!suggestions.length) {
    published
      .filter((item) => item.kind === "course")
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      )
      .forEach((item) => add(item));
  }
  return suggestions;
}
