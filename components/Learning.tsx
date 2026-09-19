"use client";
import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Search } from "lucide-react";
import {
  isComplete,
  type Content,
  assignmentInfo,
  type User,
  type Group,
  type Progress,
} from "@/lib/types";
import { CourseCard } from "./CourseCard";

function CourseRow({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  function scroll(direction: number) {
    row.current?.scrollBy({
      left: direction * row.current.clientWidth * 0.85,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div className="course-row-wrap">
      <div className="row-controls">
        <button
          className="secondary"
          aria-label={`Previous ${title} courses`}
          onClick={() => scroll(-1)}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="secondary"
          aria-label={`Next ${title} courses`}
          onClick={() => scroll(1)}
        >
          <ArrowRight size={16} />
        </button>
      </div>
      <div
        ref={row}
        className="course-row"
        role="region"
        aria-label={title}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}

export default function Learning({
  courses,
  user,
  groups,
  assigned,
  progress,
  onOpen,
  onKnowledge,
}: {
  courses: Content[];
  user: User;
  groups: Group[];
  assigned: Content[];
  progress: Progress[];
  onOpen: (id: string) => void;
  onKnowledge: () => void;
}) {
  const [view, setView] = useState<"home" | "all" | "completed">("home");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All topics");
  const [sort, setSort] = useState("due");
  const completed = assigned.filter((c) => isComplete(c, progress));
  const outstanding = assigned.filter((c) => !isComplete(c, progress));
  const pct = assigned.length
    ? Math.round((completed.length / assigned.length) * 100)
    : 100;
  const topics = Array.from(new Set(courses.map((c) => c.category)));
  const source =
    view === "all"
      ? assigned
      : view === "completed"
        ? courses.filter((c) => isComplete(c, progress))
        : courses;
  const ordered = (items: Content[]) =>
    [...items].sort((a, b) => {
      if (sort === "due")
        return (
          (assignmentInfo(a, user, groups).dueDate || "9999").localeCompare(
            assignmentInfo(b, user, groups).dueDate || "9999",
          ) || a.title.localeCompare(b.title)
        );
      if (sort === "assigned" || sort === "assigned-oldest") {
        const comparison = (
          assignmentInfo(b, user, groups).assignedAt || ""
        ).localeCompare(assignmentInfo(a, user, groups).assignedAt || "");
        return sort === "assigned" ? comparison : -comparison;
      }
      if (sort === "added")
        return (b.createdAt || b.updatedAt).localeCompare(
          a.createdAt || a.updatedAt,
        );
      return sort === "updated"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : sort === "oldest"
          ? a.updatedAt.localeCompare(b.updatedAt)
          : a.title.localeCompare(b.title);
    });
  const filtered = ordered(
    source.filter(
      (c) =>
        (topic === "All topics" || c.category === topic) &&
        [c.title, c.summary, c.category]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    ),
  );
  const card = (c: Content) => (
    <CourseCard
      key={c.id}
      course={c}
      dueDate={assignmentInfo(c, user, groups).dueDate}
      complete={isComplete(c, progress)}
      progress={
        progress.find((p) => p.content_id === c.id && p.version === c.version)
          ?.lessons.length || 0
      }
      onClick={() => onOpen(c.id)}
    />
  );
  function changeView(next: typeof view) {
    setView(next);
    setQuery("");
    setTopic("All topics");
  }
  return (
    <>
      <div className="page-heading">
        {view !== "home" && (
          <button className="text-button" onClick={() => changeView("home")}>
            ← Back to learning
          </button>
        )}
        <span className="eyebrow">A LITTLE LEARNING. A LOT OF MOMENTUM.</span>
        <h1>
          {view === "all"
            ? "Your assignments."
            : view === "completed"
              ? "Look how far you’ve come."
              : "Make your next move a great one."}
        </h1>
        <p>
          {view === "completed"
            ? "Revisit your completed courses. Your progress stays with you."
            : view === "all"
              ? "Everything assigned to you, organized by topic."
              : "Build your knowledge, sharpen your skills, and stay one step ahead."}
        </p>
      </div>
      <div className="learning-toolbar">
        {" "}
        <label className="learning-sort">
          Sort courses
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="due">Due date: earliest first</option>
            <option value="assigned">Recently assigned</option>
            <option value="assigned-oldest">Oldest assignment first</option>
            <option value="added">Recently added</option>
            <option value="title">Title A–Z</option>
            <option value="updated">Recently updated</option>
            <option value="oldest">Oldest update first</option>
          </select>
        </label>
      </div>
      {view === "home" && (
        <section className="for-you">
          <div className="section-heading">
            <div>
              <h2>
                For you <span className="count-pill">{outstanding.length}</span>
              </h2>
              <p>Your next steps to staying current.</p>
            </div>
          </div>
          <div className="assigned-layout learning-assigned">
            <div className="current-card">
              <div
                className="progress-ring"
                style={{
                  background: `conic-gradient(#0069ff ${pct}%, #e4eaf5 0)`,
                }}
                role="img"
                aria-label={`${pct}% current`}
              >
                <div>
                  <strong>
                    {pct}
                    <small>%</small>
                  </strong>
                  <span>current</span>
                </div>
              </div>
              <h3>
                {pct === 100 ? "You’re all caught up." : "Keep your momentum."}
              </h3>
              <p>
                {completed.length} of {assigned.length} assigned courses
                complete
              </p>
              <span className="current-caption">The goal? Stay at 100%.</span>
            </div>
            {outstanding.length ? (
              <CourseRow title="For you">
                {ordered(outstanding).map(card)}
              </CourseRow>
            ) : (
              <div className="empty">
                <h3>
                  {assigned.length
                    ? "You’re current. Keep exploring."
                    : "Room to explore"}
                </h3>
                <p>The full library is yours to discover.</p>
              </div>
            )}
          </div>
          <div className="learning-links">
            <button className="text-button" onClick={() => changeView("all")}>
              View all assignments <ArrowRight size={16} />
            </button>
            <button
              className="text-button"
              onClick={() => changeView("completed")}
            >
              View completed courses <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
      <section className="library">
        <div className="section-heading">
          <div>
            <h2>
              {view === "home"
                ? "Explore the library"
                : view === "all"
                  ? "All assignments"
                  : "Completed courses"}
            </h2>
            <p>
              {view === "home"
                ? "Follow your curiosity. There’s always something to discover."
                : "Browse by topic or find a specific course."}
            </p>
          </div>
          <span className="muted" role="status">
            {filtered.length} courses
          </span>
        </div>
        <div className="learning-toolbar">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Filter courses"
              placeholder="Find a course…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="topic-tabs">
          {["All topics", ...topics].map((t) => (
            <button
              key={t}
              aria-pressed={topic === t}
              className={topic === t ? "selected" : ""}
              onClick={() => setTopic(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {topics
          .filter((t) => filtered.some((c) => c.category === t))
          .map((t) => (
            <div className="channel" key={t}>
              <div className="channel-title">
                <BookOpen size={19} />
                <h3>{t}</h3>
                <span>
                  {filtered.filter((c) => c.category === t).length} courses
                </span>
              </div>
              {view === "home" ? (
                <CourseRow title={t}>
                  {filtered.filter((c) => c.category === t).map(card)}
                </CourseRow>
              ) : (
                <div className="course-grid">
                  {filtered.filter((c) => c.category === t).map(card)}
                </div>
              )}
            </div>
          ))}
        {!filtered.length && (
          <div className="empty">
            <h3>
              {view === "completed" && !query && topic === "All topics"
                ? "Your learning story starts here."
                : "No courses found"}
            </h3>
            <p>
              {view === "completed"
                ? "Completed courses will appear here. Try another filter or return to learning."
                : "Try another topic or search term."}
            </p>
          </div>
        )}
      </section>
      <div className="bottom-callout">
        <BookOpen size={22} />
        <div>
          <h3>Looking for an answer?</h3>
          <p>The knowledge library is your everyday reference.</p>
        </div>
        <button className="text-button" onClick={onKnowledge}>
          Explore knowledge <ArrowRight size={17} />
        </button>
      </div>
    </>
  );
}
