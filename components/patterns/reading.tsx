import type { ReactNode } from "react";
import ReactMarkdown from "../Markdown";
import { CheckCircle2, Clock } from "lucide-react";
import type { Content } from "@/lib/types";
import { contentPath } from "@/lib/navigation";
import { Button } from "../ui/button";
import { InitialsAvatar } from "../ui/initials-avatar";
import { ContentAction } from "./content-action";

/** Shared, server-compatible reading presentation; callers own access and actions. */
export function Article({
  item,
  name,
  back,
  children,
}: {
  item: Content;
  name: string;
  back: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="article">
      {back}
      <span className="eyebrow">{item.category}</span>
      <h1>{item.title}</h1>
      <p className="article-lede">{item.summary}</p>
      <div className="article-meta">
        <InitialsAvatar
          initials={name
            .split(" ")
            .map((x) => x[0])
            .slice(0, 2)
            .join("")}
          size="sm"
        />
        <span>{name}</span>
        <span>·</span>
        <span>
          Updated{" "}
          {new Date(item.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
        <span>·</span>
        <span>v{item.version}</span>
      </div>
      <div className="markdown">
        <ReactMarkdown>{item.body}</ReactMarkdown>
      </div>
      {children}
      <div className="article-end">
        <CheckCircle2 size={18} />
        You’re at the end. Put it into practice.
      </div>
    </article>
  );
}
export function CourseOverview({
  item,
  back,
  curriculum,
}: {
  item: Content;
  back: ReactNode;
  curriculum?: string;
}) {
  const path = contentPath("course", item.id);
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
          {item.lessons.length} lessons<span>·</span>At your own pace
        </div>
      </div>
      {item.body && (
        <div className="markdown">
          <ReactMarkdown>{item.body}</ReactMarkdown>
        </div>
      )}
      <h2>In this course</h2>
      <ol className="grid list-none gap-3 p-0">
        {item.lessons.map((lesson, index) => (
          <li key={lesson.id}>
            <ContentAction
              asChild
              className="flex w-full items-center gap-4 p-4"
            >
              <a
                href={`${path}?lesson=${encodeURIComponent(lesson.id)}${curriculum ? `&curriculum=${encodeURIComponent(curriculum)}` : ""}`}
              >
                <span>{index + 1}</span>
                <span>{lesson.title}</span>
                <span className="ml-auto">Start lesson →</span>
              </a>
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
}: {
  kind: Content["kind"];
  curriculum?: string;
}) {
  const label =
    kind === "course" ? "courses" : kind === "doc" ? "docs" : "updates";
  return (
    <Button asChild variant="link">
      <a
        href={
          curriculum
            ? `/curricula/${encodeURIComponent(curriculum)}`
            : `/${label}`
        }
      >
        ← Back to {curriculum ? "curriculum" : label}
      </a>
    </Button>
  );
}
