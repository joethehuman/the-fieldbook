import type { Content } from "./types";
export type SearchKind = Content["kind"];
export type SearchFilter = "all" | SearchKind;
export type SourcePassage = {
  contentId: string;
  kind: SearchKind;
  title: string;
  passageId: string;
  lessonId: string | null;
  lessonTitle: string | null;
  text: string;
  matchedTerms?: string[];
  publishedRevision: number | null;
  contentDate: string | null;
};
export type SearchResult = Omit<SourcePassage, "text" | "matchedTerms"> & {
  excerpt: string;
  href: string;
  highlights: string[];
};
export type SearchResponse = { results: SearchResult[]; hasMore: boolean };
export type SearchProvider = (
  query: string,
  filter: SearchFilter,
  signal: AbortSignal,
) => Promise<SearchResponse>;
export const searchLabels = { brief: "Update", doc: "Doc", course: "Course" };
export function searchWords(query: string) {
  return (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).slice(0, 12);
}
export function plainText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_`~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function contentDate(value?: string) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}
export function sourcePassages(c: Content): SourcePassage[] {
  if (c.status !== "published") return [];
  const base = {
    contentId: c.id,
    kind: c.kind,
    title: c.title,
    publishedRevision: c.publishedRevision ?? null,
    contentDate: contentDate(c.updatedAt) || contentDate(c.createdAt),
  };
  return [
    {
      ...base,
      passageId: "content",
      lessonId: null,
      lessonTitle: null,
      text: plainText(`${c.summary}\n${c.body}`),
    },
    ...(c.kind === "course"
      ? c.lessons.map((l) => ({
          ...base,
          passageId: `lesson:${l.id}`,
          lessonId: l.id,
          lessonTitle: l.title,
          text: plainText(l.body),
        }))
      : []),
  ];
}
export function destination(
  source: Pick<SourcePassage, "kind" | "contentId" | "lessonId">,
) {
  const section = { brief: "updates", doc: "docs", course: "courses" }[
    source.kind
  ];
  return `/${section}/${encodeURIComponent(source.contentId)}${source.lessonId ? `?lesson=${encodeURIComponent(source.lessonId)}` : ""}`;
}
function near(a: string, b: string) {
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diffs = [...a]
      .map((x, i) => (x === b[i] ? -1 : i))
      .filter((i) => i >= 0);
    return (
      diffs.length <= 1 ||
      (diffs.length === 2 &&
        diffs[1] === diffs[0] + 1 &&
        a[diffs[0]] === b[diffs[1]] &&
        a[diffs[1]] === b[diffs[0]])
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0,
    j = 0,
    skips = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else {
      j++;
      skips++;
    }
  }
  return skips <= 1;
}
export function makeResult(source: SourcePassage, query: string): SearchResult {
  const words = [
    ...new Set([...searchWords(query), ...(source.matchedTerms || [])]),
  ];
  const text = plainText(source.text);
  const matches = [...text.matchAll(/[\p{L}\p{N}]+/gu)].filter((m) =>
    words.some(
      (w) => m[0].toLowerCase().startsWith(w) || near(w, m[0].toLowerCase()),
    ),
  );
  const start = Math.max(0, (matches[0]?.index ?? 0) - 65);
  const excerpt = `${start ? "…" : ""}${text.slice(start, start + 220)}${text.length > start + 220 ? "…" : ""}`;
  const { text: _, matchedTerms: __, ...metadata } = source;
  return {
    ...metadata,
    excerpt,
    href: destination(source),
    highlights: [...new Set([...words, ...matches.map((m) => m[0])])],
  };
}
// Synthetic, browser-local demonstration. PostgreSQL owns production ranking.
export function demoSearch(
  content: Content[],
  query: string,
  filter: SearchFilter,
): SearchResponse {
  const words = searchWords(query);
  if (!words.length) return { results: [], hasMore: false };
  const ranked = content
    .flatMap(sourcePassages)
    .filter((p) => filter === "all" || p.kind === filter)
    .map((p) => {
      const title = p.title.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [],
        heading =
          (p.lessonTitle || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
      // Do not truncate source vocabulary to the query's 12-term limit.
      const all =
        (p.title + " " + (p.lessonTitle || "") + " " + p.text)
          .toLowerCase()
          .match(/[\p{L}\p{N}]+/gu) || [];
      const score = words.every((w) =>
        all.some((t) => t.startsWith(w) || near(w, t)),
      )
        ? words.reduce(
            (s, w) =>
              s +
              (title.some((t) => t === w)
                ? 20
                : heading.some((t) => t === w)
                  ? 12
                  : all.some((t) => t.startsWith(w))
                    ? 5
                    : 1),
            0,
          ) + (p.title.toLowerCase() === query.trim().toLowerCase() ? 100 : 0)
        : 0;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.p.contentId.localeCompare(b.p.contentId),
    );
  const unique = ranked.filter(
    (x, i) => ranked.findIndex((y) => y.p.contentId === x.p.contentId) === i,
  );
  return {
    results: unique.slice(0, 30).map((x) => makeResult(x.p, query)),
    hasMore: unique.length > 30,
  };
}
