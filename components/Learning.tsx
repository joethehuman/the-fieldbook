"use client";
import { Badge } from "@/components/ui/badge";
import { SearchField } from "./patterns/search-field";
import { Card } from "./ui/card";
import { ProgressRing, ProgressStatus } from "./ui/progress";
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
import { useState } from "react";
import { CourseRow } from "./patterns/course-row";
import { Checkbox } from "./ui/choice";
import {
  courseProgress,
  learningCollection,
  type LearningCollection,
} from "@/lib/course-progress";
import { ArrowRight, BookOpen } from "lucide-react";
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
import { CourseCard } from "./CourseCard";

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
  const [view, setView] = useState<"home" | LearningCollection>("home");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All channels");
  const [sort, setSort] = useState("recommended");
  const state = learningState(courses, user, groups, progress, settings);
  const completed = assigned.filter((c) => isComplete(c, progress));
  const outstanding = assigned.filter((c) => !isComplete(c, progress));
  const pct = completionPercent(completed.length, assigned.length);
  const source = learningCollection(
    courses,
    assigned,
    progress,
    view === "home" ? "all" : view,
    hideCompleted,
  );
  const topics = Array.from(
    new Set((view === "assigned" ? assigned : source).map((c) => c.category)),
  );
  const sequence = requiredSequence(courses, user, groups);
  const ranks = new Map(sequence.map((c, i) => [c.id, i]));
  const nextCourse = state.remaining[0];
  const viewTitle =
    view === "assigned"
      ? "For you"
      : view === "in-progress"
        ? "In progress"
        : view === "completed"
          ? "Completed"
          : "All courses";
  const ordered = (items: Content[]) =>
    [...items].sort((a, b) => {
      if (sort === "recommended") {
        const ai = ranks.get(a.id) ?? 99999,
          bi = ranks.get(b.id) ?? 99999;
        return ai - bi || a.title.localeCompare(b.title);
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
      status={courseProgress(c, progress)}
      onClick={() => onOpen(c.id)}
    />
  );
  function changeView(next: typeof view) {
    setView(next);
    setHideCompleted(false);
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
        <h1>{view === "home" ? "Courses" : "Your courses"}</h1>
        <p>
          {view === "home"
            ? "Build your knowledge, sharpen your skills, and stay one step ahead."
            : "Find your next course or pick up where you left off."}
        </p>
      </PageHeader>
      {view === "home" && publicLearning && (
        <Callout>
          <div>
            <span className="eyebrow">YOUR LEARNING</span>
            <h2>Keep your curiosity moving.</h2>
            <p>
              {courses.filter((c) => isComplete(c, progress)).length} courses
              completed ·{" "}
              {
                courses.filter((c) => courseProgress(c, progress).inProgress)
                  .length
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
          <div className="learning-links">
            <Button variant="link" onClick={() => changeView("in-progress")}>
              View in progress <ArrowRight size={16} />
            </Button>
            <Button variant="link" onClick={() => changeView("completed")}>
              View completed <ArrowRight size={16} />
            </Button>
          </div>
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
          <SplitPanel split={outstanding.length > 0} align="stretch">
            <Card className="flex flex-col items-center justify-center gap-4 text-center">
              {assigned.length > 0 ? (
                <ProgressRing value={pct} />
              ) : (
                <div className="learning-status-icon">
                  <BookOpen size={24} />
                </div>
              )}
              <div className="grid gap-2">
                <h3>
                  {!assigned.length
                    ? "Learn something new"
                    : pct === 100
                      ? "You’re up to date"
                      : state.onboarding
                        ? "Get up to speed"
                        : "Stay current"}
                </h3>
                <p>
                  {assigned.length
                    ? `${completed.length} of ${assigned.length} assigned courses complete`
                    : "No assigned courses yet."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {state.overdue.length
                    ? `${state.overdue.length} courses past their target`
                    : state.onboarding
                      ? `${Math.max(0, Math.ceil((Date.parse(state.target!) - Date.now()) / 86400000))} days left in onboarding`
                      : outstanding.length
                        ? "You’re on track"
                        : "Explore the library at your own pace."}
                </p>
              </div>
              {nextCourse && (
                <Button
                  variant="default"
                  className="mt-auto w-full"
                  onClick={() => onOpen(nextCourse.id)}
                >
                  {courseProgress(nextCourse, progress).started
                    ? "Continue course"
                    : "Start course"}
                </Button>
              )}
            </Card>
            {outstanding.length ? (
              <CourseRow title="For you">
                {sequence.filter((c) => !isComplete(c, progress)).map(card)}
              </CourseRow>
            ) : null}
          </SplitPanel>
          <div className="learning-links">
            <Button variant="link" onClick={() => changeView("assigned")}>
              View all for you <ArrowRight size={16} />
            </Button>
            <Button variant="link" onClick={() => changeView("in-progress")}>
              View in progress <ArrowRight size={16} />
            </Button>
            <Button variant="link" onClick={() => changeView("completed")}>
              View completed <ArrowRight size={16} />
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
                        <ProgressStatus
                          value={completionPercent(
                            items.filter((course) =>
                              isComplete(course, progress),
                            ).length,
                            items.length,
                          )}
                          complete={
                            items.length > 0 &&
                            items.every((course) =>
                              isComplete(course, progress),
                            )
                          }
                          started={items.some(
                            (course) =>
                              courseProgress(course, progress).started,
                          )}
                        />
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
        {view !== "home" && (
          <FilterOptions
            label="Course views"
            value={view}
            onValueChange={(value) => changeView(value as LearningCollection)}
            options={[
              ...(!guest ? [{ value: "assigned", label: "For you" }] : []),
              { value: "in-progress", label: "In progress" },
              { value: "completed", label: "Completed" },
              { value: "all", label: "All courses" },
            ]}
          />
        )}
        <SectionHeader
          title={<h2>{view === "home" ? "Explore the library" : viewTitle}</h2>}
          description={
            view === "assigned"
              ? "Courses assigned to your learning groups, organized by channel."
              : view === "in-progress"
                ? "Continue any course you’ve started, assigned or optional."
                : view === "completed"
                  ? "Revisit any course you’ve completed, assigned or optional."
                  : "Browse by channel or find a specific course."
          }
        >
          <span className="muted" role="status">
            {filtered.length} {filtered.length === 1 ? "course" : "courses"}
          </span>
          {view === "home" && (
            <Button variant="link" onClick={() => changeView("all")}>
              View all courses <ArrowRight size={16} />
            </Button>
          )}
        </SectionHeader>
        <Toolbar>
          {view === "assigned" && (
            <Field orientation="horizontal">
              <Checkbox
                checked={hideCompleted}
                onChange={(event) => setHideCompleted(event.target.checked)}
              />
              Hide completed
            </Field>
          )}
          <SearchField className="w-full max-w-sm">
            <Input
              aria-label="Filter courses"
              placeholder="Find a course…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </SearchField>
          <Field className="learning-sort">
            Sort courses
            <SelectField value={sort} onValueChange={setSort}>
              <option value="recommended">Recommended order</option>
              <option value="added">Recently added</option>
              <option value="title">Title A–Z</option>
              <option value="updated">Recently updated</option>
              <option value="oldest">Oldest update first</option>
            </SelectField>
          </Field>
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
              {query || topic !== "All channels"
                ? "No matching courses"
                : view === "assigned" && hideCompleted && assigned.length
                  ? "You’re up to date"
                  : view === "assigned"
                    ? "No assigned courses yet"
                    : view === "in-progress"
                      ? "No courses in progress"
                      : view === "completed"
                        ? "No completed courses yet"
                        : "No courses yet"}
            </h3>
            <p>
              {query || topic !== "All channels"
                ? "Try another channel or search term."
                : view === "assigned" && hideCompleted && assigned.length
                  ? "All your assigned courses are complete. Turn off Hide completed to review them."
                  : "Explore the library to find your next course."}
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
