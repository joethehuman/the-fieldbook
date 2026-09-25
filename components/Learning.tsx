"use client";
import { FormField } from "@/components/patterns/form-field";
import { Badge } from "@/components/ui/badge";
import { SearchField } from "./patterns/search-field";
import { Card } from "./ui/card";
import { ProgressRing } from "./ui/progress";
import { BrowseToolbar } from "./patterns/layout";
import { CardGrid } from "./patterns/learning-card";
import { CurriculumCard } from "./CurriculumCard";
import {
  assignedLearningCards,
  curriculumCourses,
  curriculumProgress,
  type LearningCardItem,
} from "@/lib/learning-cards";
import { FilterOptions } from "./patterns/filter-options";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  PageHeader,
  SectionHeader,
  EmptyState,
} from "@/components/patterns/layout";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { useState } from "react";
import { CourseRow } from "./patterns/course-row";
import { Switch } from "./ui/switch";
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
import { IntentLink } from "./patterns/intent-link";

export default function Learning({
  curricula = [],
  settings,
  courses,
  user,
  groups,
  assigned,
  progress,
  onOpen,
  onCurriculum,
  guest = false,
  linkedNavigation = false,
}: {
  curricula?: import("@/lib/types").Curriculum[];
  settings?: SiteSettings;
  guest?: boolean;
  linkedNavigation?: boolean;
  courses: Content[];
  user: User;
  groups: Group[];
  assigned: Content[];
  progress: Progress[];
  onOpen: (id: string) => void;
  onCurriculum: (id: string) => void;
}) {
  const [view, setView] = useState<"home" | "curricula" | LearningCollection>(
    "home",
  );
  const [hideCompleted, setHideCompleted] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All channels");
  const [sort, setSort] = useState("recommended");
  const state = learningState(courses, user, groups, progress, settings);
  const completed = assigned.filter((c) => isComplete(c, progress));
  const completedCourseCount = courses.filter((c) =>
    isComplete(c, progress),
  ).length;
  const outstanding = assigned.filter((c) => !isComplete(c, progress));
  const pct = completionPercent(completed.length, assigned.length);
  const source = learningCollection(
    courses,
    assigned,
    progress,
    view === "home" || view === "curricula" ? "all" : view,
    hideCompleted,
  );
  const topics = Array.from(
    new Set((view === "assigned" ? assigned : source).map((c) => c.category)),
  );
  const sequence = requiredSequence(courses, user, groups);
  const assignedCards = assignedLearningCards(
    sequence,
    curricula,
    user,
    groups,
  );
  const completeCard = (item: LearningCardItem) =>
    item.kind === "course"
      ? isComplete(item.course, progress)
      : curriculumProgress(item.courses, progress).complete;
  const cardCourses = (item: LearningCardItem) =>
    item.kind === "course" ? [item.course] : item.courses;
  const cardTitle = (item: LearningCardItem) =>
    item.kind === "course" ? item.course.title : item.curriculum.name;
  const displayCard = (item: LearningCardItem) =>
    item.kind === "course" ? (
      card(item.course)
    ) : (
      <CurriculumCard
        key={item.curriculum.id}
        curriculum={item.curriculum}
        courses={item.courses}
        progress={progress}
        onClick={
          linkedNavigation ? undefined : () => onCurriculum(item.curriculum.id)
        }
        href={
          linkedNavigation
            ? `/curricula/${encodeURIComponent(item.curriculum.id)}`
            : undefined
        }
      />
    );
  const browserCards = (
    view === "curricula"
      ? curricula
          .filter((c) => c.status === "published")
          .map((curriculum) => ({
            kind: "curriculum" as const,
            curriculum,
            courses: curriculumCourses(curriculum, courses),
          }))
      : assignedCards
  ).filter(
    (item) =>
      (!hideCompleted || !completeCard(item)) &&
      (topic === "All channels" ||
        cardCourses(item).some((c) => c.category === topic)) &&
      [
        cardTitle(item),
        item.kind === "course"
          ? item.course.summary
          : item.curriculum.description,
        ...cardCourses(item).map((c) => `${c.title} ${c.category}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  if (sort !== "recommended")
    browserCards.sort((a, b) =>
      sort === "title"
        ? cardTitle(a).localeCompare(cardTitle(b))
        : (sort === "oldest" ? 1 : -1) *
          (
            cardCourses(a)
              .map((c) =>
                sort === "added" ? c.createdAt || c.updatedAt : c.updatedAt,
              )
              .sort()
              .at(-1) || ""
          ).localeCompare(
            cardCourses(b)
              .map((c) =>
                sort === "added" ? c.createdAt || c.updatedAt : c.updatedAt,
              )
              .sort()
              .at(-1) || "",
          ),
    );
  const ranks = new Map(sequence.map((c, i) => [c.id, i]));
  const nextCourse = state.remaining[0];
  const viewTitle =
    view === "curricula"
      ? "Curricula"
      : view === "assigned"
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
      onClick={linkedNavigation ? undefined : () => onOpen(c.id)}
      href={
        linkedNavigation ? `/courses/${encodeURIComponent(c.id)}` : undefined
      }
    />
  );
  function changeView(next: typeof view) {
    setView(next);
    setHideCompleted(false);
    setQuery("");
    setTopic("All channels");
  }
  function browseLibrary() {
    document.getElementById("all-courses")?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  const forYouHeading = (
    <h2>
      For you <Badge variant="default">{outstanding.length}</Badge>
    </h2>
  );
  const progressCard = (
    <Card className={`flex w-full max-w-xs flex-col items-center justify-center gap-4 text-center ${assigned.length ? "" : "border-dotted border-muted-foreground/50"}`}>
      {assigned.length > 0 ? (
        <ProgressRing value={pct} />
      ) : null}
      <div className="grid gap-2">
        <h3>
          {!assigned.length
            ? guest
              ? "No recommendations yet"
              : "No courses assigned to you"
            : pct === 100
              ? "Assigned courses complete"
              : `${outstanding.length} assigned courses remaining`}
        </h3>
        {!!assigned.length && pct < 100 ? (
          <p>
            {completed.length} of {assigned.length} assigned courses complete
          </p>
        ) : completedCourseCount > 0 ? (
          <p>
            {completedCourseCount} course
            {completedCourseCount === 1 ? "" : "s"} completed
          </p>
        ) : !assigned.length ? (
          <p className="text-sm text-muted-foreground">
            Browse the full library below.
          </p>
        ) : null}
        {!guest && (state.overdue.length > 0 || state.onboarding) && (
          <p className="text-xs text-muted-foreground">
            {state.overdue.length
              ? `${state.overdue.length} courses past their target`
              : `${Math.max(0, Math.ceil((Date.parse(state.target!) - Date.now()) / 86400000))} days left in onboarding`}
          </p>
        )}
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
      {assigned.length ? (
        <Button variant="link" onClick={() => changeView("assigned")}>
          View all for you <ArrowRight size={16} />
        </Button>
      ) : (
        <Button variant="link" onClick={browseLibrary}>
          All courses <ArrowRight size={16} />
        </Button>
      )}
    </Card>
  );
  const outstandingCards = assignedCards.filter((item) => !completeCard(item));
  return (
    <>
      <PageHeader>
        {view !== "home" && (
          <Button variant="link" onClick={() => changeView("home")}>
            ← Back to courses
          </Button>
        )}
        <h1>{view === "home" ? "Courses" : "Your courses"}</h1>
      </PageHeader>
      {view === "home" && (
        <section className="for-you">
          {outstandingCards.length ? (
            <CourseRow
              title="For you"
              heading={forYouHeading}
              leading={progressCard}
            >
              {outstandingCards.map(displayCard)}
            </CourseRow>
          ) : (
            <>
              <SectionHeader title={forYouHeading} />
              {progressCard}
            </>
          )}
        </section>
      )}
      <section className="library" id="all-courses">
        {view !== "home" && view !== "curricula" && (
          <FilterOptions
            label="Course views"
            value={view}
            onValueChange={(value) => changeView(value as LearningCollection)}
            options={[
              { value: "assigned", label: "For you" },
              { value: "in-progress", label: "In progress" },
              { value: "completed", label: "Completed" },
              { value: "all", label: "All courses" },
            ]}
          />
        )}
        <SectionHeader
          title={
            <h2 className="flex items-center gap-2">
              {view === "home" ? "All courses" : viewTitle}
              {view === "home" && (
                <Badge variant="default">{courses.length}</Badge>
              )}
            </h2>
          }
        >
          {view !== "home" && (
            <span className="muted" role="status">
              {view === "assigned" || view === "curricula"
                ? `${browserCards.length} items`
                : `${filtered.length} course${filtered.length === 1 ? "" : "s"}`}
            </span>
          )}
          {view === "assigned" && (
            <Field orientation="horizontal">
              <Switch
                checked={hideCompleted}
                onCheckedChange={(checked) =>
                  setHideCompleted(checked === true)
                }
              />
              Hide completed
            </Field>
          )}
          {curricula.some((c) => c.status === "published") &&
            view !== "curricula" && (
              <Button variant="link" onClick={() => changeView("curricula")}>
                Browse curricula <ArrowRight size={16} />
              </Button>
            )}
        </SectionHeader>
        <BrowseToolbar>
          <Field>
            Search
            <SearchField>
              <Input
                aria-label="Filter courses"
                placeholder="Find a course…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </SearchField>
          </Field>
          <FormField label="Channel">
            <SelectField
              aria-label="Channel"
              value={topic}
              onValueChange={setTopic}
            >
              {["All channels", ...topics].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label="Sort courses">
            <SelectField value={sort} onValueChange={setSort}>
              <option value="recommended">Recommended order</option>
              <option value="added">Recently added</option>
              <option value="title">Title A–Z</option>
              <option value="updated">Recently updated</option>
              <option value="oldest">Oldest update first</option>
            </SelectField>
          </FormField>
        </BrowseToolbar>
        {view === "assigned" || view === "curricula" ? (
          <CardGrid>{browserCards.map(displayCard)}</CardGrid>
        ) : (
          topics
            .filter((t) => filtered.some((c) => c.category === t))
            .map((t) => (
              <div className="channel" key={t}>
                {view !== "home" && (
                  <div className="channel-title">
                    <BookOpen size={19} />
                    <h3>{t}</h3>
                    <span>
                      {filtered.filter((c) => c.category === t).length} courses
                    </span>
                  </div>
                )}
                {view === "home" ? (
                  <CourseRow title={t}>
                    {filtered.filter((c) => c.category === t).map(card)}
                  </CourseRow>
                ) : (
                  <CardGrid>
                    {filtered.filter((c) => c.category === t).map(card)}
                  </CardGrid>
                )}
              </div>
            ))
        )}
        {!(view === "assigned" || view === "curricula"
          ? browserCards.length
          : filtered.length) && (
          <EmptyState>
            <h3>
              {query || topic !== "All channels"
                ? "No matching courses"
                : view === "assigned" && hideCompleted && assigned.length
                  ? "You’re up to date"
                  : view === "assigned"
                    ? guest
                      ? "No guest recommendations yet"
                      : "No assigned courses yet"
                    : view === "in-progress"
                      ? "No courses in progress"
                      : view === "completed"
                        ? "No completed courses yet"
                        : "No courses yet"}
            </h3>
            {(query || topic !== "All channels") && (
              <p>Try another channel or search term.</p>
            )}
            {view === "assigned" &&
              hideCompleted &&
              !!assigned.length &&
              !query &&
              topic === "All channels" && (
                <p>Turn off Hide completed to review assigned courses.</p>
              )}
          </EmptyState>
        )}
      </section>
    </>
  );
}
