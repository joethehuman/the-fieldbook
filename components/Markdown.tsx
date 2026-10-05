import { Link2 } from "lucide-react";
import { remarkHeadingAnchors } from "@/lib/markdown-headings";
import { ScrollableMarkdownTable } from "./patterns/scrollable-markdown-table";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { contentLinkTarget, normalizeContentLink, type ContentLinkContext } from "@/lib/content-links";
import { isInlineVideo } from "@/lib/inline-video";
import { CourseVideo } from "./patterns/course-video";
import { Button } from "./ui/button";
import { readTableWidths, remarkTopLevelTableIndices } from "@/lib/writing-table";

export default function Markdown({
  children,
  headingPrefix,
  linkContext = "article",
  sameSiteOrigins,
  onImageOpen,
}: {
  children: string;
  headingPrefix?: string;
  linkContext?: ContentLinkContext;
  sameSiteOrigins?: readonly string[];
  onImageOpen?: (src: string, alt: string) => void;
}) {
  const { markdown, widths } = readTableWidths(children);
  return (
    <ReactMarkdown
      remarkPlugins={
        headingPrefix === undefined
          ? [remarkGfm, remarkTopLevelTableIndices]
          : [remarkGfm, remarkTopLevelTableIndices, remarkHeadingAnchors]
      }
      components={{
        ...(headingPrefix !== undefined
          ? Object.fromEntries(
              (["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag) => [
                tag,
                ({
                  id,
                  children,
                }: {
                  id?: string;
                  children?: React.ReactNode;
                }) => {
                  const Tag = tag;
                  return (
                    <Tag id={id} tabIndex={-1}>
                      {children}
                      <a
                        className="heading-permalink"
                        href={`${headingPrefix}${id}`}
                        aria-label="Link to this heading"
                      >
                        <Link2 aria-hidden="true" className="h-[1em] w-[1em]" />
                      </a>
                    </Tag>
                  );
                },
              ]),
            )
          : {}),
        a: ({ href, children }) => {
          href = href ? normalizeContentLink(href) : href;
          if (href && isInlineVideo(href, String(children)))
            return <CourseVideo url={href} title={String(children)} />;
          const target = contentLinkTarget(href, linkContext, sameSiteOrigins);
          return (
            <a href={href} target={target} rel={target ? "noopener noreferrer" : undefined}>
              {children}
              {target && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
          );
        },
        img: ({ src, alt }) =>
          typeof src === "string" ? onImageOpen ? (
            <Button type="button" variant="ghost" className="course-image-open" onClick={() => onImageOpen(src, alt || "")}
              aria-label={`Expand image: ${alt || "course image"}`}>
              <img src={src} alt={alt || ""} loading="lazy" />
            </Button>
          ) : <img src={src} alt={alt || ""} loading="lazy" /> : null,
        table: ({ children, node }) => {
          const index = node?.properties?.["data-fieldbook-table-index"];
          return <ScrollableMarkdownTable widths={typeof index === "number" ? widths[index] || undefined : undefined}>{children}</ScrollableMarkdownTable>;
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
