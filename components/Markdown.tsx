import { Link2 } from "lucide-react";
import { remarkHeadingAnchors } from "@/lib/markdown-headings";
import { Table } from "@/components/ui/table";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({
  children,
  headingPrefix,
}: {
  children: string;
  headingPrefix?: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={
        headingPrefix === undefined
          ? [remarkGfm]
          : [remarkGfm, remarkHeadingAnchors]
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
        a: ({ href, children }) =>
          href?.startsWith("/api/media/") &&
          /\.(mp4|webm)(?:\?|$)/i.test(href) ? (
            <video
              controls
              preload="metadata"
              src={href}
              aria-label={String(children)}
            />
          ) : (
            <a href={href} rel="noopener noreferrer">
              {children}
            </a>
          ),
        img: ({ src, alt }) =>
          typeof src === "string" ? (
            <img src={src} alt={alt || ""} loading="lazy" />
          ) : null,
        table: ({ children }) => (
          <div
            className="markdown-table"
            role="region"
            aria-label="Table"
            tabIndex={0}
          >
            <Table>{children}</Table>
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
