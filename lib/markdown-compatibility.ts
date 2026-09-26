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
