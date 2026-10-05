import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Learning from "../components/Learning";
import { CurriculumPage } from "../components/CurriculumPage";
import { CourseCard } from "../components/CourseCard";
import { CurriculumCard } from "../components/CurriculumCard";
import { legacyWorkspace } from "./fixtures/legacy-workspace";
import { assignedCourses, type Progress } from "../lib/types";
import { defaultSettings } from "../lib/settings";
import { addDays, todayUTC } from "../lib/learning";
import { courseProgress } from "../lib/course-progress";

function fixture() {
  const data = legacyWorkspace();
  const course = {
    ...data.content.find((c) => c.kind === "course")!,
    category: "Card category",
    assignments: undefined,
    groups: ["sales"],
  };
  const user = {
    ...data.users[0],
    hireDate: undefined,
    onboardingStart: undefined,
    learningAssignments: [
      {
        episodeId: "saved-episode",
        contentId: course.id,
        version: course.version,
        assignedAt: "2020-01-01",
        dueDate: "2020-02-01",
        catchUpDays: 30,
        sourceGroups: ["sales"],
      },
    ],
  };
  return { data, course, user };
}
function library(
  options: {
    completed?: boolean;
    dueDates?: boolean;
    guest?: boolean;
    optional?: boolean;
    curriculum?: boolean;
    dueDate?: string;
  } = {},
) {
  const { data, course, user } = fixture();
  if (options.dueDate) user.learningAssignments[0].dueDate = options.dueDate;
  const viewer = options.guest ? { ...user, id: "guest" } : user;
  const item = options.optional ? { ...course, groups: [] } : course;
  const progress: Progress[] = options.completed
    ? [
        {
          content_id: item.id,
          version: item.version,
          passed: true,
          lessons: item.lessons.map((l) => l.id),
        },
      ]
    : [];
  const curriculum = { ...data.curricula![0], courseIds: [item.id] };
  const groups = options.curriculum
    ? data.groups.map((g) =>
        g.id === "sales"
          ? {
              ...g,
              learningItems: [
                { kind: "curriculum" as const, id: curriculum.id },
              ],
            }
          : g,
      )
    : data.groups;
  return renderToStaticMarkup(
    createElement(Learning, {
      view: "home",
      courses: [item],
      curricula: options.curriculum ? [curriculum] : [],
      user: viewer,
      groups,
      progress,
      settings: {
        ...defaultSettings,
        ...data.settings,
        dueDatesEnabled: options.dueDates ?? true,
      },
      assigned: assignedCourses([item], viewer, groups),
      onOpen() {},
      onCurriculum() {},
      guest: options.guest,
    }),
  );
}

test("overdue assigned cards show Past due in homepage discovery", () => {
  const html = library();
  assert.match(html, />Past due</);
  assert.match(html, /bg-destructive-soft/);
});
test("completed courses, disabled deadlines and guests never show Past due", () => {
  for (const options of [
    { completed: true },
    { dueDates: false },
    { guest: true },
  ]) {
    const html = library(options);
    assert.doesNotMatch(html, />Past due</);
    assert.match(html, />For you</);
  }
});
test("unassigned optional courses have no relevance badge", () => {
  const html = library({ optional: true });
  assert.doesNotMatch(html, /data-slot="badge"/);
});
test("assigned curricula aggregate overdue state only while unfinished", () => {
  assert.match(
    library({ curriculum: true }),
    /data-kind="curriculum"[\s\S]*?>Past due</,
  );
  assert.doesNotMatch(
    library({ curriculum: true, completed: true }),
    />Past due</,
  );
});
test("course cards inside curriculum pages use the same saved deadline", () => {
  const { data, course, user } = fixture();
  const html = renderToStaticMarkup(
    createElement(CurriculumPage, {
      curriculum: { ...data.curricula![0], courseIds: [course.id] },
      courses: [course],
      user,
      groups: data.groups,
      progress: [],
      settings: data.settings,
      onBack() {},
      onOpen() {},
    }),
  );
  assert.match(html, />Past due</);
  assert.match(html, /Due \d+ days ago/);
});

test("unfinished assigned course cards show the relative due date", () => {
  assert.match(library({ dueDate: addDays(todayUTC(), 6) }), /Due in 6 days/);
  assert.match(library({ dueDate: addDays(todayUTC(), 1) }), /Due in 1 day/);
  assert.match(library({ dueDate: todayUTC() }), /Due today/);
  assert.match(library({ dueDate: addDays(todayUTC(), -2) }), /Due 2 days ago/);
});

test("due cue is absent for completed, optional, guest, and deadlines-off cards", () => {
  const dueDate = addDays(todayUTC(), 6);
  for (const options of [
    { completed: true },
    { optional: true },
    { guest: true },
    { dueDates: false },
  ]) {
    assert.doesNotMatch(library({ ...options, dueDate }), /Due in 6 days/);
  }
});

test("curriculum wrappers keep For you without a course due counter", () => {
  const { data, course } = fixture();
  const html = renderToStaticMarkup(
    createElement(CurriculumCard, {
      curriculum: { ...data.curricula![0], courseIds: [course.id] },
      courses: [course],
      progress: [],
      assignmentLabel: "Assigned",
    }),
  );
  assert.match(html, />For you</);
  assert.doesNotMatch(html, /Due in|Due today|days ago/);
});
test("uploaded course covers retain type, category and relevance once", () => {
  const { course } = fixture();
  const html = renderToStaticMarkup(
    createElement(CourseCard, {
      course: { ...course, coverImageUrl: "/api/media/example.png" },
      status: courseProgress(course, []),
      assignmentLabel: "Assigned",
      pastDue: true,
    }),
  );
  assert.match(html, /<img/);
  assert.match(html, /card-artwork-upload-header/);
  assert.equal(html.split("Card category").length - 1, 1);
  assert.equal(html.split(">Past due<").length - 1, 1);
});
test("card summary and facts precede the shared progress/action footer; courses without quizzes omit Quiz", () => {
  const { course } = fixture();
  const html = renderToStaticMarkup(
    createElement(CourseCard, {
      course: { ...course, questions: [], lessons: [course.lessons[0]] },
      status: courseProgress(course, []),
    }),
  );
  assert.ok(
    html.indexOf(course.summary) <
      html.indexOf('data-slot="learning-card-metadata"'),
  );
  assert.ok(
    html.indexOf('data-slot="learning-card-metadata"') <
      html.indexOf('data-slot="card-footer"'),
  );
  assert.ok(
    html.indexOf('data-slot="card-footer"') <
      html.indexOf('data-slot="progress-status"'),
  );
  assert.match(html, />1 lesson</);
  assert.doesNotMatch(html, />Quiz</);
  assert.match(html, /lucide-arrow-right/);
});

test("saved due dates today or in the future remain For you", () => {
  for (const dueDate of [todayUTC(), "9999-12-31"]) {
    const html = library({ dueDate });
    assert.doesNotMatch(html, />Past due</);
    assert.match(html, />For you</);
  }
});
