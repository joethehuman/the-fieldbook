"use client";
import { Table } from "@/components/ui/table";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
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
          <div className="markdown-table">
            <Table>{children}</Table>
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
