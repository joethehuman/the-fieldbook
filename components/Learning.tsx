"use client";
import { Badge } from "@/components/ui/badge";
import { SearchField } from "./patterns/search-field";
import { Card } from "./ui/card";
import { ProgressRing } from "./ui/progress";
import { SplitPanel } from "./patterns/layout";
import { FilterOptions } from "./patterns/filter-options";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Callout,
  PageHeader,
  Toolbar,
  SectionHeader,
  EmptyState,
} from "@/components/patterns/layout";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import {
  isComplete,
  type Content,
  type User,
  type Group,
  type Progress,
} from "@/lib/types";
import {
  completionPercent,
  learningState,
  requiredSequence,
} from "@/lib/learning";
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
  curricula = [],
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
  curricula?: import("@/lib/types").Curriculum[];
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
  const [topic, setTopic] = useState("All channels");
  const [sort, setSort] = useState("recommended");
  const state = learningState(courses, user, groups, progress, settings);
  const completed = assigned.filter((c) => isComplete(c, progress));
  const outstanding = assigned.filter((c) => !isComplete(c, progress));
  const pct = completionPercent(completed.length, assigned.length);
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
        (topic === "All channels" || c.category === topic) &&
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
    setTopic("All channels");
  }
  return (
    <>
      <PageHeader>
        {view !== "home" && (
          <Button variant="link" onClick={() => changeView("home")}>
            ← Back to courses
          </Button>
        )}
        <span className="eyebrow">YOUR ORGANIZATION</span>
        <h1>
          {view === "all"
            ? "Assigned courses"
            : view === "completed"
              ? "Completed courses"
              : "Courses"}
        </h1>
        <p>
          {view === "completed"
            ? "Revisit your completed courses. Your progress stays with you."
            : view === "all"
              ? "Your role’s courses, in a recommended order. You can explore ahead at any time."
              : "Build your knowledge, sharpen your skills, and stay one step ahead."}
        </p>
      </PageHeader>
      <Toolbar>
        {" "}
        <Field className="learning-sort">
          Sort courses
          <SelectField value={sort} onValueChange={(value) => setSort(value)}>
            <option value="recommended">Recommended order</option>
            <option value="added">Recently added</option>
            <option value="title">Title A–Z</option>
            <option value="updated">Recently updated</option>
            <option value="oldest">Oldest update first</option>
          </SelectField>
        </Field>
      </Toolbar>
      {view === "home" && publicLearning && (
        <Callout>
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
          <Button variant="link" onClick={() => changeView("completed")}>
            View completed courses →
          </Button>
        </Callout>
      )}
      {view === "home" && !publicLearning && (
        <section className="for-you">
          <SectionHeader
            title={
              <h2>
                For you <Badge variant="default">{outstanding.length}</Badge>
              </h2>
            }
            description={
              <>
                {state.onboarding
                  ? "Get up to speed at your pace."
                  : "Build your knowledge and stay current."}
              </>
            }
          ></SectionHeader>
          <SplitPanel split={outstanding.length > 0}>
            <Card className="grid justify-items-center gap-4 text-center">
              {assigned.length > 0 ? (
                <ProgressRing value={pct} />
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
                    ? `${completed.length} of ${assigned.length} assigned courses complete`
                    : "No assigned courses yet."}
                </p>
                <span className="current-caption">
                  {state.overdue.length
                    ? `${state.overdue.length} courses past their target`
                    : state.onboarding
                      ? `${Math.max(0, Math.ceil((Date.parse(state.target!) - Date.now()) / 86400000))} days remaining · Onboarding target ${state.target}`
                      : outstanding.length
                        ? `${outstanding.length} courses to complete`
                        : assigned.length
                          ? "All assigned courses are complete."
                          : "Explore the library at your own pace."}
                </span>
              </div>
              {!!outstanding.length && (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => onOpen(state.remaining[0].id)}
                >
                  Continue course
                </Button>
              )}
            </Card>
            {outstanding.length ? (
              <CourseRow title="For you">
                {ordered(outstanding).map(card)}
              </CourseRow>
            ) : null}
          </SplitPanel>
          {!!outstanding.length && (
            <details className="learning-by-group">
              <summary>View assigned courses by group</summary>
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
            <Button variant="link" onClick={() => changeView("all")}>
              View assigned courses <ArrowRight size={16} />
            </Button>
            <Button variant="link" onClick={() => changeView("completed")}>
              View completed courses <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      )}
      {view === "home" && curricula.some((c) => c.status === "published") && (
        <section className="curricula-library">
          <SectionHeader
            title={<h2>Curricula</h2>}
            description={
              <> Explore a playlist of courses in a recommended order. </>
            }
          ></SectionHeader>
          <div className="curricula-grid">
            {curricula
              .filter((c) => c.status === "published")
              .map((c) => {
                const items = c.courseIds.flatMap(
                  (id) => courses.find((course) => course.id === id) || [],
                );
                return (
                  <Card asChild key={c.id}>
                    <details className="curriculum-card">
                      <summary>
                        <strong>{c.name}</strong>
                        <span>
                          {
                            items.filter((course) =>
                              isComplete(course, progress),
                            ).length
                          }{" "}
                          of {items.length} courses complete
                        </span>
                      </summary>
                      <p>{c.description}</p>
                      <ol>
                        {items.map((course) => (
                          <li key={course.id}>
                            <Button
                              variant="link"
                              onClick={() => onOpen(course.id)}
                            >
                              {course.title}
                              {isComplete(course, progress)
                                ? " · Complete"
                                : ""}
                            </Button>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </Card>
                );
              })}
          </div>
        </section>
      )}
      <section className="library">
        <SectionHeader
          title={
            <h2>
              {view === "home"
                ? "Explore the library"
                : view === "all"
                  ? "Assigned courses"
                  : "Completed courses"}
            </h2>
          }
          description={
            <>
              {view === "home"
                ? "Follow your curiosity. There’s always something to discover."
                : "Browse by channel or find a specific course."}
            </>
          }
        >
          <span className="muted" role="status">
            {filtered.length} courses
          </span>
        </SectionHeader>
        <Toolbar>
          <SearchField className="w-full max-w-sm">
            <Input
              aria-label="Filter courses"
              placeholder="Find a course…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </SearchField>
        </Toolbar>
        <FilterOptions
          label="Course channels"
          value={topic}
          onValueChange={setTopic}
          options={["All channels", ...topics].map((value) => ({
            value,
            label: value,
          }))}
        />
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
          <EmptyState>
            <h3>
              {view === "completed" && !query && topic === "All channels"
                ? "Your learning story starts here."
                : "No courses found"}
            </h3>
            <p>
              {view === "completed"
                ? "Completed courses will appear here. Try another filter or return to courses."
                : "Try another channel or search term."}
            </p>
          </EmptyState>
        )}
      </section>
      <Callout>
        <BookOpen size={22} />
        <div>
          <h3>Looking for an answer?</h3>
          <p>The docs library is your everyday reference.</p>
        </div>
        <Button variant="link" onClick={onKnowledge}>
          Explore docs <ArrowRight size={17} />
        </Button>
      </Callout>
    </>
  );
}
