"use client";
import { orderedCourseCategories } from "@/lib/content-categories";
import { contentPath, curriculumPath } from "@/lib/navigation";
import {
  learningSortOptions,
  compareLearningRecords,
  type LearningSortRecord,
} from "@/lib/learning-sort";
import { SortPicker } from "./patterns/sort-picker";
import { FormField } from "@/components/patterns/form-field";
import { CountBadge } from "@/components/ui/badge";
import { SearchField } from "./patterns/search-field";
import { Card } from "./ui/card";
import { ProgressRing } from "./ui/progress";
import { CollectionControls } from "./patterns/collection-controls";
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
import { courseViewPaths, type LearningView } from "@/lib/course-destination";
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
  assignmentInfo,
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
  learningTarget,
} from "@/lib/learning";
import type { SiteSettings } from "@/lib/settings";
import { CourseCard } from "./CourseCard";
import { IntentLink } from "./patterns/intent-link";

export default function Learning({
  view: destinationView,
  onViewChange,
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
  view?: LearningView;
  onViewChange?: (view: LearningView) => void;
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
  const [localView, setLocalView] = useState<LearningView>("home");
  const view = destinationView || localView;
  const [hideCompleted, setHideCompleted] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All categories");
  const [sortChoice, setSortChoice] = useState<{
    view: LearningView;
    value: string;
  } | null>(null);
  const useDueDates = !guest && settings?.dueDatesEnabled !== false;
  const sortOptions = learningSortOptions(view, guest, useDueDates);
  const defaultSort =
    view === "home" || view === "all"
      ? "updated"
      : view === "assigned" && useDueDates
        ? "due-earliest"
        : "title";
  const sort =
    sortChoice?.view === view &&
    sortOptions.some((option) => option.value === sortChoice.value)
      ? sortChoice.value
      : defaultSort;
  const setSort = (value: string) => setSortChoice({ view, value });
  const state = learningState(courses, user, groups, progress, settings);
  const completed = assigned.filter((c) => isComplete(c, progress));
  const completedCourseCount = courses.filter((c) =>
    isComplete(c, progress),
  ).length;
  const inProgressCourseCount = courses.filter(
    (c) => courseProgress(c, progress).inProgress,
  ).length;
  const personalCourseCount = learningCollection(
    courses,
    assigned,
    progress,
    "yours",
  ).length;
  const assignedIds = new Set(assigned.map((c) => c.id));
  const overdueIds = new Set(state.overdue.map((c) => c.id));
  const outstanding = assigned.filter((c) => !isComplete(c, progress));
  const pct = completionPercent(completed.length, assigned.length);
  const source = learningCollection(
    courses,
    assigned,
    progress,
    view === "home" || view === "curricula" ? "all" : view,
    hideCompleted,
  );
  const topics = orderedCourseCategories(view === "assigned" ? assigned : source, settings);
  const sequence = requiredSequence(courses, user, groups);
  const assignedCards = assignedLearningCards(
    sequence,
    curricula,
    user,
    groups,
  );
  const assignedCurriculumIds = new Set(
    assignedCards.flatMap((item) =>
      item.kind === "curriculum" ? [item.curriculum.id] : [],
    ),
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
        settings={settings}
        assignmentLabel={
          assignedCurriculumIds.has(item.curriculum.id)
            ? useDueDates
              ? "Assigned"
              : "Recommended"
            : undefined
        }
        pastDue={item.courses.some((course) => overdueIds.has(course.id))}
        onClick={
          linkedNavigation ? undefined : () => onCurriculum(item.curriculum.id)
        }
        href={
          linkedNavigation
            ? `${curriculumPath(item.curriculum.id, item.curriculum.name)}?from=${encodeURIComponent(courseViewPaths[view])}`
            : undefined
        }
      />
    );
  const browserCards = (
    view === "curricula" || view === "home"
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
      (topic === "All categories" ||
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
  const sortRecord = (course: Content): LearningSortRecord => ({
    id: course.id,
    title: course.title,
    updatedAt: course.updatedAt,
    assignedAt:
      assignedIds.has(course.id) && !guest
        ? assignmentInfo(course, user, groups).assignedAt
        : undefined,
    dueDate:
      assignedIds.has(course.id) && !isComplete(course, progress)
        ? learningTarget(course, user, groups, settings)
        : undefined,
  });
  const cardRecord = (item: LearningCardItem): LearningSortRecord => {
    const records = cardCourses(item).map(sortRecord);
    return {
      id: item.kind === "course" ? item.course.id : item.curriculum.id,
      title: cardTitle(item),
      // A curriculum's actionable date is its earliest unfinished assigned deadline.
      assignedAt: records
        .flatMap((record) => (record.assignedAt ? [record.assignedAt] : []))
        .sort()[0],
      dueDate: records
        .flatMap((record) => (record.dueDate ? [record.dueDate] : []))
        .sort()[0],
    };
  };
  browserCards.sort((a, b) =>
    compareLearningRecords(
      cardRecord(a),
      cardRecord(b),
      view === "home" || view === "curricula"
        ? view === "curricula"
          ? sort
          : "title"
        : sort,
    ),
  );
  const nextCourse = state.remaining[0];
  const viewTitle =
    view === "curricula"
      ? "Curricula"
      : view === "yours"
        ? "Your courses"
        : view === "assigned"
          ? guest
            ? "For you"
            : useDueDates
              ? "Assigned"
              : "Recommended"
          : view === "in-progress"
            ? "In progress"
            : view === "completed"
              ? "Completed"
              : "All courses";
  const ordered = (items: Content[]) =>
    [...items].sort((a, b) =>
      compareLearningRecords(sortRecord(a), sortRecord(b), sort),
    );
  const filtered = ordered(
    source.filter(
      (c) =>
        (topic === "All categories" || c.category === topic) &&
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
      settings={settings}
      status={courseProgress(c, progress)}
      dueDate={sortRecord(c).dueDate}
      assignmentLabel={
        assignedIds.has(c.id)
          ? useDueDates
            ? "Assigned"
            : "Recommended"
          : undefined
      }
      pastDue={overdueIds.has(c.id)}
      onClick={linkedNavigation ? undefined : () => onOpen(c.id)}
      href={
        linkedNavigation
          ? `${contentPath("course", c.id, c.title)}?from=${encodeURIComponent(courseViewPaths[view])}`
          : undefined
      }
    />
  );
  function changeView(next: typeof view) {
    if (onViewChange) onViewChange(next);
    else setLocalView(next);
    setHideCompleted(false);
    setQuery("");
    setTopic("All categories");
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
    <h2 className="flex items-center gap-2">
      For you <CountBadge>{outstanding.length}</CountBadge>
    </h2>
  );
  const outstandingCards = assignedCards.filter((item) => !completeCard(item));
  const progressCard = (
    <Card
      className={`flex w-full flex-col items-center justify-center gap-4 text-center ${outstandingCards.length ? "" : "max-w-xs"} ${assigned.length ? "pt-8 sm:pt-10" : "border-dotted border-muted-foreground/50"}`}
    >
      {assigned.length > 0 ? <ProgressRing value={pct} /> : null}
      <div className="grid gap-2">
        <h3>
          {!assigned.length
            ? useDueDates
              ? "No courses assigned to you"
              : "No recommendations yet"
            : pct === 100
              ? useDueDates
                ? "Assigned courses complete"
                : "Recommended courses complete"
              : useDueDates
                ? `${outstanding.length} assigned courses remaining`
                : `${outstanding.length} recommended courses to explore`}
        </h3>
        {!!assigned.length ? (
          <p>
            {completed.length} of {assigned.length}{" "}
            {useDueDates ? "assigned" : "recommended"} courses complete
          </p>
        ) : !assigned.length && personalCourseCount > 0 ? (
          <p>
            {[
              inProgressCourseCount > 0
                ? `${inProgressCourseCount} in progress`
                : null,
              completedCourseCount > 0
                ? `${completedCourseCount} completed`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : !assigned.length ? (
          <p className="text-sm text-muted-foreground">
            Explore the course library at your own pace.
          </p>
        ) : null}
        {useDueDates &&
          assigned.length > 0 &&
          (state.overdue.length > 0 || state.onboarding) && (
            <p className="text-xs text-muted-foreground">
              {state.overdue.length
                ? `${state.overdue.length} courses past their due date`
                : `${Math.max(0, Math.ceil((Date.parse(state.target!) - Date.now()) / 86400000))} days left in onboarding`}
            </p>
          )}
      </div>
      {nextCourse && (
        <Button
          variant="default"
          className="mt-auto"
          onClick={() => onOpen(nextCourse.id)}
        >
          {courseProgress(nextCourse, progress).started
            ? "Continue course"
            : "Start course"}
        </Button>
      )}
      {!assigned.length && personalCourseCount > 0 && (
        <Button
          variant="link"
          className="text-sm text-foreground underline hover:text-foreground"
          onClick={() => changeView("yours")}
        >
          View your courses
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
              splitAt="tablet"
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
            variant="underline"
            value={view}
            onValueChange={(value) => changeView(value as LearningCollection)}
            options={[
              ...(!guest ? [{ value: "yours", label: "Your courses" }] : []),
              {
                value: "assigned",
                label: guest
                  ? "For you"
                  : useDueDates
                    ? "Assigned"
                    : "Recommended",
              },
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
              {view === "home" && <CountBadge>{courses.length}</CountBadge>}
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
        </SectionHeader>
        <CollectionControls
          search={
            <SearchField>
              <Input
                aria-label="Filter courses"
                placeholder="Find a course…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </SearchField>
          }
          sort={
            <SortPicker
              label={view === "curricula" ? "Sort curricula" : "Sort courses"}
              value={sort}
              onValueChange={setSort}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SortPicker>
          }
          filters={
            topic === "All categories"
              ? []
              : [
                  {
                    id: "category",
                    label: `Category: ${topic}`,
                    onRemove: () => setTopic("All categories"),
                  },
                ]
          }
          onClear={() => setTopic("All categories")}
        >
          <FormField label="Category">
            <SelectField
              aria-label="Category"
              value={topic}
              onValueChange={setTopic}
            >
              {["All categories", ...topics].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectField>
          </FormField>
        </CollectionControls>
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
        {view === "home" && browserCards.length > 0 && (
          <CourseRow title="Curricula">
            {browserCards.map(displayCard)}
          </CourseRow>
        )}
        {!(view === "assigned" || view === "curricula"
          ? browserCards.length
          : filtered.length + (view === "home" ? browserCards.length : 0)) && (
          <EmptyState>
            <h3>
              {query || topic !== "All categories"
                ? "No matching courses"
                : view === "assigned" && hideCompleted && assigned.length
                  ? "You’re up to date"
                  : view === "assigned"
                    ? guest
                      ? "No guest recommendations yet"
                      : useDueDates
                        ? "No assigned courses yet"
                        : "No recommended courses yet"
                    : view === "in-progress"
                      ? "No courses in progress"
                      : view === "completed"
                        ? "No completed courses yet"
                        : "No courses yet"}
            </h3>
            {(query || topic !== "All categories") && (
              <p>Try another category or search term.</p>
            )}
            {view === "assigned" &&
              hideCompleted &&
              !!assigned.length &&
              !query &&
              topic === "All categories" && (
                <p>
                  Turn off Hide completed to review{" "}
                  {useDueDates ? "assigned" : "recommended"} courses.
                </p>
              )}
          </EmptyState>
        )}
      </section>
    </>
  );
}
