import { markdownHeadings } from "@/lib/markdown-headings";
import {
  availableDocSections,
  orderedDocs,
  sectionForDoc,
  sectionPath,
  type DocLink,
} from "@/lib/docs-navigation";
import type { DocSection } from "@/lib/docs-navigation";
import { ReadingOutline } from "./reading-outline";
import type { ReactNode } from "react";
import ReactMarkdown from "../Markdown";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { Content } from "@/lib/types";
import { contentPath } from "@/lib/navigation";
import { Button } from "../ui/button";
import { InitialsAvatar } from "../ui/initials-avatar";
import { ContentAction } from "./content-action";
import { IntentLink } from "./intent-link";
import Link from "next/link";

/** Shared, server-compatible reading presentation; callers own access and actions. */
export function Article({
  item,
  name,
  back,
  children,
  documents = [],
  sectionOrder,
  sections = [],
  demo = false,
  onDocument,
  sameSiteOrigins,
}: {
  item: Content;
  name: string;
  back: ReactNode;
  children?: ReactNode;
  documents?: DocLink[];
  sectionOrder?: string[];
  sections?: DocSection[];
  demo?: boolean;
  onDocument?: (id: string) => void;
  sameSiteOrigins?: readonly string[];
}) {
  const isDoc = item.kind === "doc";
  const headings = isDoc ? markdownHeadings(item.body) : [];
  const prefix = demo ? `#docs/${encodeURIComponent(item.id)}?heading=` : "#";
  const ordered = orderedDocs(documents, sectionOrder, sections);
  const allSections = availableDocSections(documents, sectionOrder, sections);
  const placement = isDoc ? sectionForDoc(item, allSections) : undefined;
  const index = ordered.findIndex((doc) => doc.id === item.id);
  const neighbors = index < 0 ? [] : [ordered[index - 1], ordered[index + 1]];
  return (
    <div
      className={
        isDoc
          ? `reading-layout${headings.length ? " has-outline" : ""}`
          : undefined
      }
    >
      <div className="reading-columns">
        <article className="article">
          <header className="article-header">
            <div className="article-navigation">{back}</div>
            <h1>{item.title}</h1>
            <p className="article-lede">{item.summary}</p>
            <div className="article-meta">
              <span className="article-author">
                <InitialsAvatar
                  initials={name
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")}
                  size="sm"
                />
                <span>{name}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {placement
                  ? sectionPath(placement, allSections)
                  : item.category}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Updated{" "}
                {new Date(item.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </span>
              <span aria-hidden="true">·</span>
              <span>v{item.version}</span>
            </div>
          </header>
          <div className="markdown">
            <ReactMarkdown headingPrefix={isDoc ? prefix : undefined} sameSiteOrigins={sameSiteOrigins}>
              {item.body}
            </ReactMarkdown>
          </div>
          {children}
          {isDoc && neighbors.some(Boolean) && (
            <nav
              className="document-pagination"
              aria-label="Previous and next documents"
            >
              {neighbors.map(
                (doc, direction) =>
                  doc && (
                    <Button
                      asChild
                      variant="ghost"
                      key={doc.id}
                      className={`document-pagination-link h-auto min-w-0 whitespace-normal p-3 ${direction === 0 ? "justify-start text-left" : "justify-end text-right"}`}
                    >
                      {demo || onDocument ? (
                        <a
                          data-direction={direction === 0 ? "previous" : "next"}
                          href={
                            demo
                              ? `#docs/${encodeURIComponent(doc.id)}`
                              : contentPath("doc", doc.id)
                          }
                          onClick={
                            onDocument
                              ? (event) => {
                                  if (
                                    event.button ||
                                    event.metaKey ||
                                    event.ctrlKey ||
                                    event.shiftKey ||
                                    event.altKey
                                  )
                                    return;
                                  event.preventDefault();
                                  onDocument(doc.id);
                                }
                              : undefined
                          }
                        >
                          {direction === 0 && (
                            <ChevronLeft aria-hidden="true" size={16} />
                          )}
                          <span className="grid min-w-0 gap-1">
                            <span className="text-xs font-normal text-muted-foreground">
                              {direction === 0 ? "Previous" : "Next"}
                            </span>
                            <span className="[overflow-wrap:anywhere]">
                              {doc.title}
                            </span>
                          </span>
                          {direction === 1 && (
                            <ChevronRight aria-hidden="true" size={16} />
                          )}
                        </a>
                      ) : (
                        <IntentLink
                          data-direction={direction === 0 ? "previous" : "next"}
                          href={contentPath("doc", doc.id)}
                          eager
                        >
                          {direction === 0 && (
                            <ChevronLeft aria-hidden="true" size={16} />
                          )}
                          <span className="grid min-w-0 gap-1">
                            <span className="text-xs font-normal text-muted-foreground">
                              {direction === 0 ? "Previous" : "Next"}
                            </span>
                            <span className="[overflow-wrap:anywhere]">
                              {doc.title}
                            </span>
                          </span>
                          {direction === 1 && (
                            <ChevronRight aria-hidden="true" size={16} />
                          )}
                        </IntentLink>
                      )}
                    </Button>
                  ),
              )}
            </nav>
          )}
        </article>
        {isDoc && (
          <ReadingOutline key={item.id} headings={headings} prefix={prefix} />
        )}
      </div>
    </div>
  );
}
export function CourseOverview({
  item,
  back,
  curriculum,
  lessonBase,
}: {
  item: Content;
  back: ReactNode;
  curriculum?: string;
  lessonBase?: string;
}) {
  const path = lessonBase
    ? `${lessonBase}/${encodeURIComponent(item.id)}`
    : contentPath("course", item.id);
  return (
    <div className="course-detail">
      {back}
      <div className="course-detail-heading">
        <span className="eyebrow">{item.category}</span>
        <h1>{item.title}</h1>
        <p>{item.summary}</p>
        <div className="course-detail-meta">
          <Clock size={16} />
          {item.duration} min<span>·</span>
          {item.lessons.length} lessons
        </div>
      </div>
      {item.body && (
        <div className="markdown">
          <ReactMarkdown linkContext="course">{item.body}</ReactMarkdown>
        </div>
      )}
      <h2>In this course</h2>
      <ol className="grid list-none gap-3 p-0">
        {item.lessons.map((lesson, index) => (
          <li key={lesson.id}>
            <ContentAction
              asChild
              className="flex w-full flex-wrap items-center gap-4 p-4"
            >
              <Link
                prefetch
                href={`${path}?lesson=${encodeURIComponent(lesson.id)}${curriculum ? `&curriculum=${encodeURIComponent(curriculum)}` : ""}`}
              >
                <span>{index + 1}</span>
                <span>{lesson.title}</span>
                <span className="ml-auto">Start lesson →</span>
              </Link>
            </ContentAction>
          </li>
        ))}
      </ol>
      {item.questions.length > 0 && (
        <p>Finish with a {item.questions.length}-question knowledge check.</p>
      )}
    </div>
  );
}
export function ReadingBack({
  kind,
  curriculum,
  clientNavigation = false,
}: {
  kind: Content["kind"];
  curriculum?: string;
  clientNavigation?: boolean;
}) {
  const label =
    kind === "course" ? "courses" : kind === "doc" ? "docs" : "updates";
  return (
    <Button asChild variant="link">
      {clientNavigation ? (
        <IntentLink
          href={
            curriculum
              ? `/curricula/${encodeURIComponent(curriculum)}`
              : `/${label}`
          }
          eager
        >
          ← Back to {curriculum ? "curriculum" : label}
        </IntentLink>
      ) : (
        <a
          href={
            curriculum
              ? `/curricula/${encodeURIComponent(curriculum)}`
              : `/${label}`
          }
        >
          ← Back to {curriculum ? "curriculum" : label}
        </a>
      )}
    </Button>
  );
}
