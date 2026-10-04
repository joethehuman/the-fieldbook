import { unified } from "unified";
import remarkParse from "remark-parse";
import type { AiCitation } from "./ai";

// A small structural Markdown type keeps this presentation helper independent
// of Streamdown and its transitive AST type packages.
type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};
export type AnswerCitation = { number: number; source: AiCitation };
type CitationPresentation = {
  byId: ReadonlyMap<string, AnswerCitation>;
  sources: AnswerCitation[];
};
const parser = unified().use(remarkParse);
const nonProse = new Set([
  "code",
  "inlineCode",
  "html",
  "definition",
  "link",
  "linkReference",
  "image",
  "imageReference",
]);

/** Number verified destinations in reading order, independently of retrieval IDs. */
export function answerCitations(
  text: string,
  verifiedSources: AiCitation[],
): CitationPresentation {
  const byId = new Map<string, AnswerCitation>();
  const byHref = new Map<string, AnswerCitation>();
  const verified = new Map(
    verifiedSources.map((source) => [source.id, source]),
  );
  if (!verified.size) return { byId, sources: [] };
  function visit(node: MarkdownNode) {
    if (nonProse.has(node.type)) return;
    if (node.type === "text") {
      for (const match of (node.value || "").matchAll(/\[(S\d+)\]/g)) {
        const source = verified.get(match[1]);
        if (!source || byId.has(source.id)) continue;
        const citation = byHref.get(source.href) || {
          number: byHref.size + 1,
          source,
        };
        byHref.set(source.href, citation);
        byId.set(source.id, citation);
      }
    }
    node.children?.forEach(visit);
  }
  visit(parser.parse(text));
  return { byId, sources: [...byHref.values()] };
}

/** Verified citations and the explicit demo link are active; model links stay inert. */
export function citationLinks({
  numbers,
  pending = false,
  demo = false,
}: {
  numbers: Readonly<Record<string, number>>;
  pending?: boolean;
  demo?: boolean;
}) {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === "link" || child.type === "linkReference") {
          if (
            demo &&
            child.type === "link" &&
            child.url === "https://thefieldbook.org/"
          )
            return child;
          // Neutralize even a model-written link imitating our citation URL.
          return child.children || [];
        }
        if (nonProse.has(child.type)) return child;
        if (child.type !== "text") {
          visit(child);
          return child;
        }
        // Keep internal IDs (including an unfinished trailing ID) out of prose
        // until final metadata can replace them with verified numbered links.
        const value = pending
          ? (child.value || "").replace(/\[(?:S\d*)?$/, "")
          : child.value || "";
        const result: MarkdownNode[] = [];
        let cursor = 0;
        for (const cluster of value.matchAll(/(?:\[S\d+\][ \t]*)+/g)) {
          const start = cluster.index;
          result.push({ type: "text", value: value.slice(cursor, start) });
          const seen = new Set<number>();
          for (const match of cluster[0].matchAll(/\[(S\d+)\]/g)) {
            const number = numbers[match[1]];
            if (!number) {
              if (!pending) result.push({ type: "text", value: match[0] });
            } else if (!seen.has(number)) {
              if (seen.size) result.push({ type: "text", value: " " });
              result.push({
                type: "link",
                url: `/__fieldbook-citation/${number}`,
                children: [{ type: "text", value: `[${number}]` }],
              });
              seen.add(number);
            }
          }
          const trailing = cluster[0].match(/[ \t]+$/)?.[0];
          if (trailing) result.push({ type: "text", value: trailing });
          cursor = start + cluster[0].length;
        }
        result.push({ type: "text", value: value.slice(cursor) });
        return result;
      });
    }
    visit(tree);
  };
}
