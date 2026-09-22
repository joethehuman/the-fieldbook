import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

export type Heading = { id: string; text: string; depth: number };
type Node = {
  type: string;
  value?: string;
  alt?: string | null;
  depth?: number;
  children?: Node[];
  data?: { hProperties?: Record<string, unknown> };
};
const textOf = (node: Node): string =>
  node.type === "image"
    ? node.alt || ""
    : node.value || (node.children || []).map(textOf).join("");

/** The renderer and outline run this same AST pass, never a Markdown regex. */
export function assignHeadingAnchors(tree: Node): Heading[] {
  const used = new Set<string>();
  const headings: Heading[] = [];
  function visit(node: Node) {
    if (node.type === "heading") {
      const text = textOf(node).trim();
      const slug =
        text
          .toLowerCase()
          .normalize("NFKC")
          .replace(/[^\p{L}\p{N}\s_-]/gu, "")
          .replace(/\s+/g, "-") || "section";
      const base = `heading-${slug}`;
      let id = base,
        count = 2;
      while (used.has(id)) id = `${base}-${count++}`;
      used.add(id);
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, id },
      };
      if ((node.depth === 2 || node.depth === 3) && text)
        headings.push({ id, text, depth: node.depth });
    }
    node.children?.forEach(visit);
  }
  visit(tree);
  return headings;
}
export function remarkHeadingAnchors() {
  return (tree: Node) => {
    assignHeadingAnchors(tree);
  };
}
export function markdownHeadings(body: string): Heading[] {
  return assignHeadingAnchors(
    unified().use(remarkParse).use(remarkGfm).parse(body),
  );
}
