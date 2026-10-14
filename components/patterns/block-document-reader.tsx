import { Fragment, type ReactNode } from "react";
import type {
  BlockDocument,
  BlockInline,
  WritingBlock,
} from "@/lib/block-document";
import { tableCellInline } from "@/lib/block-document";
import {
  contentLinkTarget,
  normalizeContentLink,
  type ContentLinkContext,
} from "@/lib/content-links";
import { CourseVideo } from "./course-video";
import { CodeBlock } from "./code-block";
import { ScrollableMarkdownTable } from "./scrollable-markdown-table";
import { TableBody, TableCell, TableHead, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { AuthoredColor } from "../ui/authored-color";
import { AuthoredMedia } from "../ui/authored-media";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../ui/collapsible";
import { ChevronRight, Square, SquareCheck } from "lucide-react";

/** Small static reader: structured documents never load the authoring engine. */
export function BlockDocumentReader({
  document,
  headingPrefix,
  linkContext = "article",
  sameSiteOrigins,
  onImageOpen,
}: {
  document: BlockDocument;
  headingPrefix?: string;
  linkContext?: ContentLinkContext;
  sameSiteOrigins?: readonly string[];
  onImageOpen?: (src: string, alt: string) => void;
}) {
  const usedHeadings = new Set<string>();
  function inline(items: BlockInline[]): ReactNode {
    return items.map((item, index) => {
      if (item.type === "link") {
        const href = normalizeContentLink(item.href);
        const target = contentLinkTarget(href, linkContext, sameSiteOrigins);
        return (
          <a
            key={index}
            href={href}
            target={target}
            rel={target ? "noopener noreferrer" : undefined}
          >
            {inline(item.content)}
            {target && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        );
      }
      let rendered: ReactNode = item.text.split("\n").map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {part}
        </Fragment>
      ));
      if (item.styles.code) rendered = <code>{rendered}</code>;
      if (item.styles.bold) rendered = <strong>{rendered}</strong>;
      if (item.styles.italic) rendered = <em>{rendered}</em>;
      if (item.styles.strike) rendered = <del>{rendered}</del>;
      if (item.styles.underline) rendered = <u>{rendered}</u>;
      return (
        <AuthoredColor
          key={index}
          inline
          textColor={item.styles.textColor}
          backgroundColor={item.styles.backgroundColor}
        >
          {rendered}
        </AuthoredColor>
      );
    });
  }
  function blocks(items: WritingBlock[]): ReactNode[] {
    const result: ReactNode[] = [];
    for (let index = 0; index < items.length; index++) {
      const b = items[index];
      const text = Array.isArray(b.content) ? inline(b.content) : null;
      if (
        ["bulletListItem", "numberedListItem", "checkListItem"].includes(b.type)
      ) {
        const entries: WritingBlock[] = [b];
        while (items[index + 1]?.type === b.type) entries.push(items[++index]);
        const children = entries.map((entry) => {
          const CheckIcon = entry.props.checked ? SquareCheck : Square;
          return (
            <li key={entry.id} data-text-alignment={entry.props.textAlignment}>
              {entry.type === "checkListItem" && (
                <span
                  className="block-check"
                  role="img"
                  aria-label={entry.props.checked ? "Completed" : "Incomplete"}
                >
                  <CheckIcon size={18} />
                </span>
              )}
              {Array.isArray(entry.content) && inline(entry.content)}
              {blocks(entry.children)}
            </li>
          );
        });
        result.push(
          b.type === "numberedListItem" ? (
            <ol key={b.id} start={b.props.start}>
              {children}
            </ol>
          ) : (
            <ul
              key={b.id}
              className={
                b.type === "checkListItem" ? "block-checklist" : undefined
              }
            >
              {children}
            </ul>
          ),
        );
        continue;
      }
      let element: ReactNode;
      if (b.type === "heading") {
        const contentText = Array.isArray(b.content)
          ? b.content
              .map((i) =>
                i.type === "text"
                  ? i.text
                  : i.content.map((t) => t.text).join(""),
              )
              .join("")
              .trim()
          : "";
        const slug =
          contentText
            .toLowerCase()
            .normalize("NFKC")
            .replace(/[^\p{L}\p{N}\s_-]/gu, "")
            .replace(/\s+/g, "-") || "section";
        const base = `heading-${slug}`;
        let id = base;
        let count = 2;
        while (usedHeadings.has(id)) id = `${base}-${count++}`;
        usedHeadings.add(id);
        const Tag = `h${b.props.level || 1}` as
          "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        element = (
          <Tag
            data-text-alignment={b.props.textAlignment}
            id={headingPrefix !== undefined ? id : undefined}
            tabIndex={headingPrefix !== undefined ? -1 : undefined}
          >
            {text}
            {headingPrefix !== undefined && (
              <a
                className="heading-permalink"
                href={`${headingPrefix}${id}`}
                aria-label="Link to this heading"
              >
                #
              </a>
            )}
          </Tag>
        );
      } else if (b.type === "quote") {
        result.push(
          <blockquote key={b.id}>
            <p data-text-alignment={b.props.textAlignment}>{text}</p>
            {blocks(b.children)}
          </blockquote>,
        );
        continue;
      } else if (b.type === "divider") element = <hr />;
      else if (b.type === "codeBlock")
        element = (
          <CodeBlock
            code={
              Array.isArray(b.content)
                ? b.content
                    .map((i) =>
                      i.type === "text"
                        ? i.text
                        : i.content.map((t) => t.text).join(""),
                    )
                    .join("")
                : ""
            }
            language={b.props.language || "text"}
          />
        );
      else if (b.type === "video" || b.type === "videoEmbed")
        element = b.props.url && (
          <AuthoredMedia width={b.props.previewWidth}>
            <CourseVideo
              url={b.props.url}
              title={b.props.title || b.props.caption || "Video"}
            />
          </AuthoredMedia>
        );
      else if (b.type === "image") {
        const src = b.props.url;
        const alt = b.props.caption || b.props.name || "";
        element = src && (
          <AuthoredMedia width={b.props.previewWidth}>
            {onImageOpen ? (
              <Button
                variant="ghost"
                className="course-image-open"
                onClick={() => onImageOpen(src, alt)}
                aria-label={`Expand image: ${alt || "course image"}`}
              >
                <img src={src} alt={alt} loading="lazy" />
              </Button>
            ) : (
              <img src={src} alt={alt} loading="lazy" />
            )}
          </AuthoredMedia>
        );
      } else if (b.type === "table" && b.content && !Array.isArray(b.content)) {
        const table = b.content;
        const widths = table.columnWidths?.every((w) => typeof w === "number")
          ? (table.columnWidths as number[])
          : undefined;
        element = (
          <ScrollableMarkdownTable widths={widths}>
            <TableBody>
              {table.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.cells.map((cell, columnIndex) => {
                    const align =
                      typeof cell === "object" && !Array.isArray(cell)
                        ? cell.props.textAlignment
                        : undefined;
                    const Cell =
                      rowIndex < (table.headerRows || 0) ||
                      columnIndex < (table.headerCols || 0)
                        ? TableHead
                        : TableCell;
                    return (
                      <Cell
                        key={columnIndex}
                        align={align}
                        className={
                          align === "center"
                            ? "text-center"
                            : align === "justify"
                              ? "text-justify"
                              : undefined
                        }
                      >
                        {inline(tableCellInline(cell))}
                      </Cell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </ScrollableMarkdownTable>
        );
      } else
        element = <p data-text-alignment={b.props.textAlignment}>{text}</p>;
      if (
        b.type === "toggleListItem" ||
        (b.type === "heading" && b.props.isToggleable)
      ) {
        const contentLabel = Array.isArray(b.content)
          ? b.content
              .map((i) =>
                i.type === "text"
                  ? i.text
                  : i.content.map((t) => t.text).join(""),
              )
              .join("")
          : "section";
        result.push(
          <Collapsible key={b.id} className="block-toggle" defaultOpen>
            <div className="block-toggle-heading">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Toggle ${contentLabel || "section"}`}
                >
                  <ChevronRight size={18} />
                </Button>
              </CollapsibleTrigger>
              {element}
            </div>
            <CollapsibleContent className="block-toggle-content">
              {blocks(b.children)}
            </CollapsibleContent>
          </Collapsible>,
        );
        continue;
      }
      result.push(
        <Fragment key={b.id}>
          <AuthoredColor
            textColor={b.props.textColor}
            backgroundColor={b.props.backgroundColor}
          >
            {element}
          </AuthoredColor>
          {blocks(b.children)}
        </Fragment>,
      );
    }
    return result;
  }
  return <>{blocks(document.blocks)}</>;
}
