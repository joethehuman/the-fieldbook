import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $createParagraphNode } from "lexical";
import { Heading1, Heading2, Heading3, Heading4, List, ListOrdered, Pilcrow, Quote } from "lucide-react";

/** Block styles shared by insertion commands and selected-text formatting. */
export const writingBlockStyles = [
  { kind: "paragraph", name: "Normal Text", icon: Pilcrow, terms: "text paragraph normal" },
  { kind: "h1", name: "Heading 1", icon: Heading1, terms: "h1 title heading" },
  { kind: "h2", name: "Heading 2", icon: Heading2, terms: "h2 title heading" },
  { kind: "h3", name: "Heading 3", icon: Heading3, terms: "h3 title heading" },
  { kind: "h4", name: "Heading 4", icon: Heading4, terms: "h4 title heading" },
  { kind: "bullet", name: "Bulleted list", icon: List, terms: "bullets list" },
  { kind: "number", name: "Numbered list", icon: ListOrdered, terms: "numbers list" },
  { kind: "quote", name: "Callout", icon: Quote, terms: "quote callout" },
] as const;

export type WritingBlockStyle = (typeof writingBlockStyles)[number]["kind"];
export type WritingBlock = Exclude<WritingBlockStyle, "bullet" | "number">;

export function createWritingBlock(kind: WritingBlock) {
  return kind === "paragraph"
    ? $createParagraphNode()
    : kind === "quote"
      ? $createQuoteNode()
      : $createHeadingNode(kind);
}
