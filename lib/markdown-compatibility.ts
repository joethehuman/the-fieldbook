import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const parser = unified().use(remarkParse).use(remarkGfm);
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
