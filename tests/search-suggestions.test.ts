import test from "node:test";
import assert from "node:assert/strict";
import { searchSuggestions } from "../lib/search-suggestions";
import { guestRecommendations } from "../lib/guest-recommendations";
import { defaultSettings } from "../lib/settings";
import type { Content, User } from "../lib/types";

function item(
  id: string,
  kind: Content["kind"] = "doc",
  overrides: Partial<Content> = {},
): Content {
  return {
    id,
    kind,
    title: id,
    summary: "Summary",
    body: "Unneeded body",
    category: "Reference",
    folder: "",
    status: "published",
    version: 1,
    updatedAt: "2026-10-01T00:00:00Z",
    duration: 5,
    groups: [],
    lessons: [
      { id: "first", title: "First", body: "Lesson body" },
      { id: "next", title: "Next", body: "Lesson body" },
    ],
    questions: [],
    ...overrides,
  };
}
const user: User = {
  id: "learner",
  name: "Learner",
  email: "learner@example.test",
  active: true,
  role: "learner",
  groups: ["audience"],
};

test("unfinished assigned courses put current-version activity first and omit completions", () => {
  const content = ["unstarted", "started", "completed", "optional"].map((id) =>
    item(id, "course", { groups: id === "optional" ? [] : ["audience"] }),
  );
  const suggestions = searchSuggestions({
    content,
    user,
    groups: [
      {
        id: "audience",
        name: "Audience",
        requiredCourseIds: ["unstarted", "completed", "started"],
      },
    ],
    progress: [
      { content_id: "started", version: 1, lessons: ["first"], passed: false },
      {
        content_id: "completed",
        version: 1,
        lessons: ["first", "next"],
        passed: true,
      },
    ],
  });
  assert.deepEqual(
    suggestions.map(({ contentId, detail }) => [contentId, detail]),
    [
      ["started", "Continue course"],
      ["unstarted", "Assigned course"],
    ],
  );
  assert.equal(suggestions[0].href, "/courses/started--started");
  assert.equal(suggestions[0].lessonId, null);
});

test("older course versions do not become Continue suggestions or hide a new assignment", () => {
  const result = searchSuggestions({
    content: [
      item("new-version", "course", { version: 2, groups: ["audience"] }),
    ],
    user,
    groups: [{ id: "audience", name: "Audience" }],
    progress: [
      {
        content_id: "new-version",
        version: 1,
        lessons: ["first", "next"],
        passed: true,
      },
    ],
  });
  assert.equal(result[0].detail, "Assigned course");
});

test("new readers get recent published Updates and Docs in saved navigation order", () => {
  const content = [
    item("alphabetical"),
    item("first-doc"),
    item("old", "brief"),
    item("renewed", "brief", { feedAt: "2026-10-10T00:00:00Z" }),
    item("draft-secret", "brief", {
      status: "draft",
      updatedAt: "2026-10-12T00:00:00Z",
    }),
  ];
  const before = structuredClone(content);
  const result = searchSuggestions({
    content,
    docSections: [
      {
        id: "section",
        name: "Reference",
        legacyCategory: "Reference",
        legacyFolder: "",
        docOrder: ["first-doc", "alphabetical"],
      },
    ],
  });
  assert.deepEqual(
    result.map((item) => item.contentId),
    ["renewed", "old", "first-doc", "alphabetical"],
  );
  assert.deepEqual(content, before);
  assert.deepEqual(Object.keys(result[0]).sort(), [
    "contentId",
    "detail",
    "href",
    "kind",
    "lessonId",
    "title",
  ]);
});

test("guest recommendations use the existing projection without exposing audience records", () => {
  const content = [
    item("recommended", "course", { groups: ["guest-audience"] }),
    item("optional", "course"),
    item("update", "brief", { groups: ["guest-audience"] }),
    item("reference"),
  ];
  const projected = guestRecommendations({
    content,
    groups: [
      {
        id: "guest-audience",
        name: "Private audience",
        requiredCourseIds: ["recommended"],
      },
    ],
    curricula: [],
    settings: { ...defaultSettings, guestGroupId: "guest-audience" },
  });
  const result = searchSuggestions({
    content: projected.content,
    user: projected.user,
    groups: projected.groups,
  });
  assert.deepEqual(
    result.map((item) => item.contentId),
    ["recommended", "update", "reference"],
  );
  assert.equal(result[0].detail, "Recommended course");
  assert.doesNotMatch(
    JSON.stringify(result),
    /Private audience|guest-audience|Unneeded body/,
  );
});

test("lists are bounded and deduplicated; thin or empty libraries remain useful", () => {
  const content = Array.from({ length: 7 }, (_, i) =>
    item(`course-${i}`, "course", { groups: ["audience"] }),
  );
  assert.equal(
    searchSuggestions({
      content,
      user,
      groups: [{ id: "audience", name: "Audience" }],
    }).length,
    4,
  );
  assert.equal(searchSuggestions({ content }).length, 4);
  assert.deepEqual(searchSuggestions({ content: [] }), []);
  const update = item("targeted", "brief", { groups: ["audience"] });
  assert.deepEqual(
    searchSuggestions({ content: [update, item("reference")], user }).map(
      (item) => item.contentId,
    ),
    ["targeted", "reference"],
  );
});
