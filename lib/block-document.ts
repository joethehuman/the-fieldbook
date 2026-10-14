import { z } from "zod";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { readTableWidths, writeTableWidths } from "./writing-table";
import { normalizeContentLink, isSafeContentLink } from "./content-links";
import { videoSource } from "./video";
import { isInlineVideo } from "./inline-video";

const stylesSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    strike: z.boolean().optional(),
    code: z.boolean().optional(),
    underline: z.boolean().optional(),
    textColor: z.string().max(100).optional(),
    backgroundColor: z.string().max(100).optional(),
  })
  .strict();
const textSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().max(200000),
    styles: stylesSchema,
  })
  .strict();
const linkSchema = z
  .object({
    type: z.literal("link"),
    href: z.string().max(2000).refine(isSafeContentLink, "Unsupported link."),
    content: z.array(textSchema).max(10000),
  })
  .strict();
const inlineSchema = z.union([textSchema, linkSchema]);
export type BlockInline = z.infer<typeof inlineSchema>;
const propsSchema = z
  .object({
    textColor: z.string().max(100).optional(),
    backgroundColor: z.string().max(100).optional(),
    textAlignment: z.enum(["left", "center", "right", "justify"]).optional(),
    level: z.number().int().min(1).max(6).optional(),
    isToggleable: z.boolean().optional(),
    language: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[^\s`]+$/)
      .optional(),
    start: z.number().int().min(0).max(100000).optional(),
    checked: z.boolean().optional(),
    url: z.string().max(2000).optional(),
    name: z.string().max(1000).optional(),
    caption: z.string().max(2000).optional(),
    showPreview: z.boolean().optional(),
    previewWidth: z.number().finite().min(1).max(16384).optional(),
    title: z.string().max(1000).optional(),
  })
  .strict();
const cellSchema = z
  .object({
    type: z.literal("tableCell"),
    props: z
      .object({
        backgroundColor: z.string().max(100).optional(),
        textColor: z.string().max(100).optional(),
        textAlignment: z
          .enum(["left", "center", "right", "justify"])
          .optional(),
        colspan: z.literal(1).optional(),
        rowspan: z.literal(1).optional(),
      })
      .strict(),
    content: z.array(inlineSchema).max(10000),
  })
  .strict();
const tableSchema = z
  .object({
    type: z.literal("tableContent"),
    columnWidths: z
      .array(z.number().finite().min(1).max(16384).nullable().optional())
      .max(100)
      .optional(),
    headerRows: z.number().int().min(0).max(1).optional(),
    headerCols: z.number().int().min(0).max(1).optional(),
    rows: z
      .array(
        z
          .object({
            cells: z
              .array(z.union([cellSchema, z.array(inlineSchema), z.string()]))
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type WritingBlock = {
  id: string;
  type:
    | "paragraph"
    | "heading"
    | "bulletListItem"
    | "numberedListItem"
    | "checkListItem"
    | "toggleListItem"
    | "quote"
    | "divider"
    | "codeBlock"
    | "table"
    | "image"
    | "video"
    | "videoEmbed";
  props: z.infer<typeof propsSchema>;
  content?: BlockInline[] | z.infer<typeof tableSchema>;
  children: WritingBlock[];
};
const blockSchema: z.ZodType<WritingBlock> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).max(100),
      type: z.enum([
        "paragraph",
        "heading",
        "bulletListItem",
        "numberedListItem",
        "checkListItem",
        "toggleListItem",
        "quote",
        "divider",
        "codeBlock",
        "table",
        "image",
        "video",
        "videoEmbed",
      ]),
      props: propsSchema,
      content: z
        .union([z.array(inlineSchema).max(10000), tableSchema])
        .optional(),
      children: z.array(blockSchema).max(10000),
    })
    .strict(),
);
export type BlockDocument = {
  format: "fieldbook-blocks";
  version: 1;
  blocks: WritingBlock[];
};
export const blockDocumentSchema: z.ZodType<BlockDocument> = z
  .object({
    format: z.literal("fieldbook-blocks"),
    version: z.literal(1),
    blocks: z.array(blockSchema).min(1).max(10000),
  })
  .strict()
  .superRefine((doc, ctx) => {
    let count = 0;
    const ids = new Set<string>();
    function visit(block: WritingBlock, depth: number) {
      if (++count > 10000 || depth > 16 || ids.has(block.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid block depth, count or duplicate identifier.",
        });
        return;
      }
      ids.add(block.id);
      if (
        ["divider", "image", "video", "videoEmbed"].includes(block.type) &&
        block.content &&
        (!Array.isArray(block.content) || block.content.length)
      )
        ctx.addIssue({
          code: "custom",
          message: "This block does not accept inline content.",
        });
      if (
        block.type === "codeBlock" &&
        Array.isArray(block.content) &&
        block.content.some(
          (item) =>
            item.type !== "text" ||
            Object.values(item.styles).some(
              (value) => !!value && value !== "default",
            ),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Code blocks accept plain text only.",
        });
      if (block.type === "image") {
        const url = block.props.url || "";
        if (
          url &&
          !/^\/api\/media\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(url) &&
          !/^https:\/\//.test(url)
        )
          ctx.addIssue({
            code: "custom",
            message: "Use an HTTPS image or private Fieldbook image.",
          });
      }
      if (
        (block.type === "video" || block.type === "videoEmbed") &&
        block.props.url &&
        !videoSource(block.props.url)
      )
        ctx.addIssue({ code: "custom", message: "Unsupported video URL." });
      if (block.type === "table") {
        if (!block.content || Array.isArray(block.content))
          ctx.addIssue({ code: "custom", message: "A table needs rows." });
        else if (
          block.content.rows.some(
            (row) =>
              row.cells.length !==
              (block.content as z.infer<typeof tableSchema>).rows[0].cells
                .length,
          )
        )
          ctx.addIssue({
            code: "custom",
            message: "Table rows must have the same number of cells.",
          });
      } else if (block.content && !Array.isArray(block.content))
        ctx.addIssue({ code: "custom", message: "Invalid block content." });
      block.children.forEach((child) => visit(child, depth + 1));
    }
    doc.blocks.forEach((block) => visit(block, 0));
    if (JSON.stringify(doc).length > 1000000)
      ctx.addIssue({ code: "custom", message: "Block document is too large." });
  });

type Ast = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  alt?: string;
  title?: string | null;
  lang?: string | null;
  meta?: string | null;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  identifier?: string;
  align?: (string | null)[];
  children?: Ast[];
};
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, { bullet: "-", fences: true, emphasis: "*" });
const text = (
  value: string,
  styles: z.infer<typeof stylesSchema> = {},
): BlockInline => ({ type: "text", text: value, styles });
const block = (
  type: WritingBlock["type"],
  content?: WritingBlock["content"],
  props: WritingBlock["props"] = {},
): WritingBlock => ({
  id: crypto.randomUUID(),
  type,
  props,
  ...(content ? { content } : {}),
  children: [],
});

/** Import only understood Markdown. Unsupported source remains available unchanged in recovery. */
export function importMarkdownDocument(markdown: string): BlockDocument {
  const { markdown: source, widths } = readTableWidths(markdown);
  const root = processor.parse(source) as Ast;
  const definitions = new Map(
    (root.children || [])
      .filter((n) => n.type === "definition")
      .map((n) => [n.identifier, n]),
  );
  let tableIndex = 0;
  function inline(
    nodes: Ast[],
    styles: z.infer<typeof stylesSchema> = {},
  ): BlockInline[] {
    return nodes.flatMap((n): BlockInline[] => {
      if (n.type === "text" || n.type === "inlineCode")
        return [
          text(
            n.value || "",
            n.type === "inlineCode" ? { ...styles, code: true } : styles,
          ),
        ];
      if (n.type === "break") return [text("\n", styles)];
      if (["strong", "emphasis", "delete"].includes(n.type))
        return inline(n.children || [], {
          ...styles,
          [n.type === "strong"
            ? "bold"
            : n.type === "emphasis"
              ? "italic"
              : "strike"]: true,
        });
      if (n.type === "link" || n.type === "linkReference") {
        const ref =
          n.type === "linkReference" ? definitions.get(n.identifier) : n;
        if (!ref?.url || ref.title)
          throw new Error("This link syntax requires Markdown recovery.");
        return [
          {
            type: "link",
            href: ref.url,
            content: inline(n.children || [], styles).flatMap((x) =>
              x.type === "text" ? [x] : x.content,
            ),
          },
        ];
      }
      throw new Error("This formatting requires Markdown recovery.");
    });
  }
  function convert(nodes: Ast[]): WritingBlock[] {
    return nodes.flatMap((n): WritingBlock[] => {
      if (n.type === "definition") return [];
      if (n.type === "paragraph") {
        const child = n.children?.length === 1 ? n.children[0] : undefined;
        if (child?.type === "image" || child?.type === "imageReference") {
          const ref =
            child.type === "imageReference"
              ? definitions.get(child.identifier)
              : child;
          if (!ref?.url || ref.title)
            throw new Error("This image syntax requires Markdown recovery.");
          return [
            block("image", undefined, {
              url: ref.url,
              name: child.alt || "",
              caption: child.alt || "",
              showPreview: true,
            }),
          ];
        }
        if (
          child?.type === "link" &&
          child.url &&
          isInlineVideo(
            child.url,
            child.children?.map((c) => c.value || "").join("") || "",
          )
        ) {
          const title =
            child.children?.map((c) => c.value || "").join("") || "Video";
          return [
            block(
              videoSource(child.url)?.type === "embed" ? "videoEmbed" : "video",
              undefined,
              {
                url: child.url,
                ...(videoSource(child.url)?.type === "embed"
                  ? { title }
                  : { caption: title, name: title, showPreview: true }),
              },
            ),
          ];
        }
        return [block("paragraph", inline(n.children || []))];
      }
      if (n.type === "heading")
        return [
          block("heading", inline(n.children || []), { level: n.depth || 1 }),
        ];
      if (n.type === "blockquote") {
        const children = convert(n.children || []);
        const first = children.shift();
        if (!first || first.type !== "paragraph")
          throw new Error("This callout requires Markdown recovery.");
        return [{ ...first, type: "quote", children }];
      }
      if (n.type === "list")
        return (n.children || []).map((item, index) => {
          const children = convert(item.children || []);
          const first = children.shift();
          if (!first || first.type !== "paragraph")
            throw new Error("This list requires Markdown recovery.");
          return {
            ...first,
            type:
              item.checked != null
                ? "checkListItem"
                : n.ordered
                  ? "numberedListItem"
                  : "bulletListItem",
            props:
              item.checked != null
                ? { checked: item.checked }
                : n.ordered && index === 0 && n.start != null && n.start !== 1
                  ? { start: n.start }
                  : {},
            children,
          };
        });
      if (n.type === "thematicBreak") return [block("divider")];
      if (n.type === "code") {
        if (n.meta)
          throw new Error("This code annotation requires Markdown recovery.");
        return [
          block("codeBlock", [text(n.value || "")], {
            language: n.lang || "text",
          }),
        ];
      }
      if (n.type === "table") {
        const saved = widths[tableIndex++];
        return [
          block("table", {
            type: "tableContent",
            headerRows: 1,
            ...(saved ? { columnWidths: saved } : {}),
            rows: (n.children || []).map((row) => ({
              cells: (row.children || []).map((cell, index) => ({
                type: "tableCell" as const,
                props: {
                  textAlignment: (n.align?.[index] || "left") as
                    "left" | "center" | "right",
                },
                content: inline(cell.children || []),
              })),
            })),
          }),
        ];
      }
      throw new Error("This formatting requires Markdown recovery.");
    });
  }
  const blocks = convert(root.children || []);
  return blockDocumentSchema.parse({
    format: "fieldbook-blocks",
    version: 1,
    blocks: blocks.length ? blocks : [block("paragraph", [])],
  });
}

function inlineAst(items: BlockInline[]): Ast[] {
  return items.flatMap((item): Ast[] => {
    if (item.type === "link")
      return [
        {
          type: "link",
          url: normalizeContentLink(item.href),
          children: inlineAst(item.content),
        },
      ];
    const parts = item.styles.code ? [item.text] : item.text.split("\n");
    return parts.flatMap((part, index) => {
      let node: Ast = {
        type: item.styles.code ? "inlineCode" : "text",
        value: part,
      };
      for (const [style, type] of [
        ["bold", "strong"],
        ["italic", "emphasis"],
        ["strike", "delete"],
      ] as const)
        if (item.styles[style]) node = { type, children: [node] };
      return [...(index ? [{ type: "break" }] : []), ...(part ? [node] : [])];
    });
  });
}
export function tableCellInline(
  cell: z.infer<typeof tableSchema>["rows"][number]["cells"][number],
): BlockInline[] {
  return typeof cell === "string"
    ? [text(cell)]
    : Array.isArray(cell)
      ? cell
      : cell.content;
}
/** Markdown is generated from blocks; it is never another writable source of truth. */
export function exportBlockMarkdown(doc: BlockDocument): string {
  const widths: (number[] | null)[] = [];
  function convert(blocks: WritingBlock[], top = false): Ast[] {
    const nodes: Ast[] = [];
    for (const b of blocks) {
      const content = Array.isArray(b.content) ? inlineAst(b.content) : [];
      if (
        [
          "bulletListItem",
          "numberedListItem",
          "checkListItem",
          "toggleListItem",
        ].includes(b.type)
      ) {
        const ordered = b.type === "numberedListItem";
        let list = nodes.at(-1);
        if (list?.type !== "list" || list.ordered !== ordered) {
          list = {
            type: "list",
            ordered,
            start: b.props.start ?? 1,
            children: [],
          };
          nodes.push(list);
        }
        list.children!.push({
          type: "listItem",
          ...(b.type === "checkListItem" ? { checked: !!b.props.checked } : {}),
          children: [
            { type: "paragraph", children: content },
            ...convert(b.children),
          ],
        });
        continue;
      }
      if (b.type === "heading")
        nodes.push({
          type: "heading",
          depth: b.props.level || 1,
          children: content,
        });
      else if (b.type === "quote") {
        nodes.push({
          type: "blockquote",
          children: [
            { type: "paragraph", children: content },
            ...convert(b.children),
          ],
        });
        continue;
      } else if (b.type === "divider") nodes.push({ type: "thematicBreak" });
      else if (b.type === "codeBlock")
        nodes.push({
          type: "code",
          lang: b.props.language === "text" ? null : b.props.language,
          value: Array.isArray(b.content)
            ? b.content
                .map((i) =>
                  i.type === "text"
                    ? i.text
                    : i.content.map((t) => t.text).join(""),
                )
                .join("")
            : "",
        });
      else if (b.type === "image") {
        if (b.props.url)
          nodes.push({
            type: "paragraph",
            children: [
              {
                type: "image",
                url: b.props.url,
                alt: b.props.caption || b.props.name || "",
              },
            ],
          });
      } else if (b.type === "video" || b.type === "videoEmbed") {
        if (b.props.url)
          nodes.push({
            type: "paragraph",
            children: [
              {
                type: "link",
                url: b.props.url,
                children: [
                  {
                    type: "text",
                    value: b.props.title || b.props.caption || "Video",
                  },
                ],
              },
            ],
          });
      } else if (b.type === "table" && b.content && !Array.isArray(b.content)) {
        const table = b.content;
        if (top)
          widths.push(
            table.columnWidths?.every((w) => typeof w === "number" && w >= 144)
              ? (table.columnWidths as number[])
              : null,
          );
        const first = table.rows[0];
        const align = first.cells.map((cell) =>
          typeof cell === "object" && !Array.isArray(cell)
            ? cell.props.textAlignment || "left"
            : "left",
        );
        nodes.push({
          type: "table",
          align,
          children: table.rows.map((row) => ({
            type: "tableRow",
            children: row.cells.map((cell) => ({
              type: "tableCell",
              children: inlineAst(tableCellInline(cell)),
            })),
          })),
        });
      } else if (b.type === "paragraph" && content.length)
        nodes.push({ type: "paragraph", children: content });
      nodes.push(...convert(b.children));
    }
    return nodes;
  }
  return writeTableWidths(
    processor
      .stringify({ type: "root", children: convert(doc.blocks, true) } as never)
      .trimEnd(),
    widths,
  );
}
export function canonicalBody<
  T extends { body: string; bodyDocument?: BlockDocument },
>(value: T): T {
  return value.bodyDocument
    ? { ...value, body: exportBlockMarkdown(value.bodyDocument) }
    : value;
}

/** Older clients may edit metadata, but must not discard or contradict native blocks. */
export function preserveBlockDocumentWrite<
  T extends { body: string; bodyDocument?: BlockDocument },
>(
  next: T,
  previous?: { body: string; bodyDocument?: BlockDocument },
): T & { bodyDocument?: BlockDocument } {
  if (!previous?.bodyDocument) return canonicalBody(next);
  if (!next.bodyDocument) {
    if (next.body !== previous.body)
      throw new Error(
        "This content uses blocks. Fetch and update bodyDocument rather than replacing only its Markdown export.",
      );
    return canonicalBody({ ...next, bodyDocument: previous.bodyDocument });
  }
  if (
    JSON.stringify(next.bodyDocument) ===
      JSON.stringify(previous.bodyDocument) &&
    next.body !== previous.body
  )
    throw new Error(
      "Markdown is generated from bodyDocument. Update the blocks to change this content.",
    );
  return canonicalBody(next);
}

/** Bound recursive input before schema traversal, including malformed API payloads. */
export function assertBlockDocumentInputLimits(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const blocks = (value as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return;
  const pending = blocks.map((block) => ({ block, depth: 0 }));
  let count = 0;
  const seen = new Set<object>();
  while (pending.length) {
    const { block, depth } = pending.pop()!;
    if (++count > 10000 || depth > 16)
      throw new Error("Block document exceeds its depth or size limit.");
    if (!block || typeof block !== "object") continue;
    if (seen.has(block))
      throw new Error("Block document contains repeated references.");
    seen.add(block);
    const children = (block as { children?: unknown }).children;
    if (Array.isArray(children)) {
      if (children.length > 10000)
        throw new Error("Block document is too large.");
      for (const child of children)
        pending.push({ block: child, depth: depth + 1 });
    }
  }
}

/** Include a legacy lesson video in its first native edit without changing the saved lesson on open. */
export function lessonWritingDocument(lesson: {
  id: string;
  videoUrl?: string;
  bodyDocument?: BlockDocument;
}): BlockDocument | undefined {
  if (!lesson.bodyDocument || !lesson.videoUrl) return lesson.bodyDocument;
  const video = importMarkdownDocument(`[Video](${lesson.videoUrl})`).blocks[0];
  const base = `legacy-video-${lesson.id}`.slice(0, 90);
  video.id = base;
  let suffix = 1;
  while (lesson.bodyDocument.blocks.some((block) => block.id === video.id))
    video.id = `${base}-${suffix++}`;
  return {
    ...lesson.bodyDocument,
    blocks: [video, ...lesson.bodyDocument.blocks],
  };
}
