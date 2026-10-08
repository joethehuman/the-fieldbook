import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const parser = unified().use(remarkParse).use(remarkGfm);
type MarkdownNode = { type: string; alt?: string; children?: MarkdownNode[] };
/** Course images need a useful text alternative before publication. */
export function hasMissingImageAlt(markdown: string): boolean {
  const visit = (node: MarkdownNode): boolean =>
    ((node.type === "image" || node.type === "imageReference") && !node.alt?.trim()) ||
    !!node.children?.some(visit);
  return visit(parser.parse(markdown) as MarkdownNode);
}

/** One open editor's derived results; never reuse validation across changed bodies. */
export function createLessonImageAltValidator(validate = hasMissingImageAlt) {
  let cache = new Map<string, { body: string; missing: boolean }>();
  return (lessons: readonly { id: string; body: string }[]) => {
    const next = new Map<string, { body: string; missing: boolean }>();
    const missing = new Set<string>();
    for (const lesson of lessons) {
      const previous = cache.get(lesson.id);
      const result = previous?.body === lesson.body
        ? previous
        : { body: lesson.body, missing: validate(lesson.body) };
      next.set(lesson.id, result);
      if (result.missing) missing.add(lesson.id);
    }
    // Removed lessons and superseded bodies must not accumulate while editing.
    cache = next;
    return missing;
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, value]) =>
            !["position", "spread"].includes(key) &&
            value !== null &&
            value !== undefined &&
            value !== "",
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  return value;
}
/** Reject lossy editor imports, allowing equivalent Markdown whitespace/markers. */
export function equivalentMarkdown(before: string, after: string) {
  return (
    JSON.stringify(canonical(parser.parse(before))) ===
    JSON.stringify(canonical(parser.parse(after)))
  );
}
