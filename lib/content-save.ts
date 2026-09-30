import type { Content } from "./types";
import type { Workspace } from "./store";
import { correctOptionIds } from "./course-quiz";

/** Merge one acknowledged editorial save without replacing unrelated workspace state. */
export function mergeSavedContent(data: Workspace, saved: Content): Workspace {
  const replace = (items: Content[], item: Content) =>
    items.some((entry) => entry.id === item.id)
      ? items.map((entry) => (entry.id === item.id ? item : entry))
      : [item, ...items];
  const { publishedSignature, ...published } = saved;
  return {
    ...data,
    content: replace(data.content, saved),
    ...(saved.status === "published"
      ? {
          publishedContent: replace(data.publishedContent || [], {
            ...published,
            groups: [],
            assignments: [],
            questions: saved.questions.map((question) => {
              const { answer, correctOptionIds: correct, ...safe } = question;
              return {
                ...safe,
                multiple: correctOptionIds(question).length > 1,
              };
            }),
          }),
        }
      : {}),
  };
}
