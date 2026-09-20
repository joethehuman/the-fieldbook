"use client";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
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
import { learningState, requiredSequence } from "@/lib/learning";
import type { SiteSettings } from "@/lib/settings";
import { ancestorIds, effectiveGroups } from "@/lib/types";
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
        <Button
          variant="outline"
          aria-label={`Previous ${title} courses`}
          onClick={() => scroll(-1)}
        >
          <ArrowLeft size={16} />
        </Button>
        <Button
          variant="outline"
          aria-label={`Next ${title} courses`}
          onClick={() => scroll(1)}
        >
          <ArrowRight size={16} />
        </Button>
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
  settings,
  courses,
  user,
  groups,
  assigned,
  progress,
  onOpen,
  onKnowledge,
  publicLearning = false,
  guest = false,
  onSignIn,
}: {
  settings?: SiteSettings;
  publicLearning?: boolean;
  guest?: boolean;
  onSignIn?: () => void;
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
  const [sort, setSort] = useState("recommended");
  const state = learningState(courses, user, groups, progress, settings);
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
      if (sort === "recommended") {
        const ids = requiredSequence(courses, user, groups).map((c) => c.id);
        const ai = ids.indexOf(a.id),
          bi = ids.indexOf(b.id);
        return (
          (ai < 0 ? 99999 : ai) - (bi < 0 ? 99999 : bi) ||
          a.title.localeCompare(b.title)
        );
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
        <span className="eyebrow">YOUR WORKSPACE</span>
        <h1>
          {view === "all"
            ? "Required learning"
            : view === "completed"
              ? "Completed courses"
              : "Learning"}
        </h1>
        <p>
          {view === "completed"
            ? "Revisit your completed courses. Your progress stays with you."
            : view === "all"
              ? "Your role’s learning, in a recommended order. You can explore ahead at any time."
              : "Build your knowledge, sharpen your skills, and stay one step ahead."}
        </p>
      </div>
      <div className="learning-toolbar">
        {" "}
        <label className="learning-sort">
          Sort courses
          <SelectField value={sort} onValueChange={(value) => setSort(value)}>
            <option value="recommended">Recommended order</option>
            <option value="added">Recently added</option>
            <option value="title">Title A–Z</option>
            <option value="updated">Recently updated</option>
            <option value="oldest">Oldest update first</option>
          </SelectField>
        </label>
      </div>
      {view === "home" && publicLearning && (
        <section className="public-learning">
          <div>
            <span className="eyebrow">YOUR LEARNING</span>
            <h2>Keep your curiosity moving.</h2>
            <p>
              {courses.filter((c) => isComplete(c, progress)).length} courses
              completed ·{" "}
              {
                courses.filter(
                  (c) =>
                    progress.some(
                      (p) => p.content_id === c.id && p.version === c.version,
                    ) && !isComplete(c, progress),
                ).length
              }{" "}
              in progress
            </p>
            <p className="muted">
              {guest
                ? "Progress is saved in this browser. Sign in to keep learning across devices."
                : "Your progress is saved to your account. Pick up wherever you left off."}
            </p>
            {guest && (
              <Button variant="default" onClick={onSignIn}>
                Sign in with Google
              </Button>
            )}
          </div>
          <button
            className="text-button"
            onClick={() => changeView("completed")}
          >
            View completed courses →
          </button>
        </section>
      )}
      {view === "home" && !publicLearning && (
        <section className="for-you">
          <div className="section-heading">
            <div>
              <h2>
                For you <span className="count-pill">{outstanding.length}</span>
              </h2>
              <p>
                {state.onboarding
                  ? "Get up to speed at your pace."
                  : "Build your knowledge and stay current."}
              </p>
            </div>
          </div>
          <div
            className={
              "assigned-layout learning-assigned" +
              (!outstanding.length ? " learning-current" : "")
            }
          >
            <div className="current-card">
              {assigned.length > 0 ? (
                <div
                  className="progress-ring"
                  style={{
                    background: `conic-gradient(var(--accent, #0069ff) ${pct}%, #e4eaf5 0)`,
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
              ) : (
                <div className="learning-status-icon">
                  <BookOpen size={24} />
                </div>
              )}
              <div className="learning-status-copy">
                <h3>
                  {!assigned.length
                    ? "Learn something new"
                    : state.onboarding
                      ? "Get up to speed"
                      : pct === 100
                        ? "You’re up to date"
                        : "Stay current"}
                </h3>
                <p>
                  {assigned.length
                    ? `${completed.length} of ${assigned.length} required courses complete`
                    : "No required courses right now."}
                </p>
                <span className="current-caption">
                  {state.overdue.length
                    ? `${state.overdue.length} courses need attention`
                    : state.onboarding
                      ? `${Math.max(0, Math.ceil((Date.parse(state.target!) - Date.now()) / 86400000))} days remaining · Onboarding target ${state.target}`
                      : outstanding.length
                        ? `${outstanding.length} courses to catch up on · You’re on track`
                        : assigned.length
                          ? "All required learning is complete."
                          : "Explore the library at your own pace."}
                </span>
              </div>
              {!!outstanding.length && (
                <Button
                  variant="default"
                  onClick={() => onOpen(state.remaining[0].id)}
                >
                  Continue learning
                </Button>
              )}
            </div>
            {outstanding.length ? (
              <CourseRow title="For you">
                {ordered(outstanding).map(card)}
              </CourseRow>
            ) : null}
          </div>
          {!!outstanding.length && (
            <details className="learning-by-group">
              <summary>View required learning by group</summary>
              {groups
                .filter((g) => effectiveGroups(user, groups).has(g.id))
                .sort(
                  (a, b) =>
                    ancestorIds(a.id, groups).size -
                      ancestorIds(b.id, groups).size ||
                    a.name.localeCompare(b.name),
                )
                .map((g) => {
                  const items = requiredSequence(
                    courses,
                    { ...user, groups: [g.id] },
                    [{ ...g, parentId: undefined }],
                  ).filter((c) => !isComplete(c, progress));
                  return items.length ? (
                    <div className="channel" key={g.id}>
                      <div className="channel-title">
                        <BookOpen size={19} />
                        <h3>{g.name}</h3>
                        <span>Recommended order</span>
                      </div>
                      <CourseRow title={g.name}>{items.map(card)}</CourseRow>
                    </div>
                  ) : null;
                })}
            </details>
          )}
          <div className="learning-links">
            <button className="text-button" onClick={() => changeView("all")}>
              View required learning <ArrowRight size={16} />
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
                  ? "Required learning"
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
        <div className="learning-toolbar catalog-toolbar">
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
