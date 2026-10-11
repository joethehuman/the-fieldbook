import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { withPublishedSnapshots } from "../lib/demo-publication";
import { applyDemoBulk, metadataPatch } from "../lib/bulk-actions";
import {
  availableCategories,
  categoryLists,
  categoryName,
  categoryItems,
  orderedCourseCategories,
  assertCategoriesCanBeRemoved,
  assertContentCategory,
} from "../lib/content-categories";
import { publicSettings, defaultSettings } from "../lib/settings";
import {
  saveCategorySettings,
  createCategorySettingsSaver,
} from "../lib/category-settings-save";

function fixture() {
  const data = withPublishedSnapshots(freshWorkspace());
  data.settings = {
    ...data.settings!,
    contentCategories: categoryLists([
      ...data.content,
      ...data.publishedContent!,
    ]),
  };
  return { data, actor: data.users.find((item) => item.role === "admin")! };
}

test("separate category lists retain empty names, reject duplicate names, and preserve legacy reader order", () => {
  const { data } = fixture();
  data.settings!.contentCategories!.course.push("Empty category");
  assert(
    availableCategories(data.content, "course", data.settings).includes(
      "Empty category",
    ),
  );
  assert(
    !availableCategories(data.content, "brief", data.settings).includes(
      "Empty category",
    ),
  );
  assert.throws(
    () =>
      categoryName(
        " empty CATEGORY ",
        data.settings!.contentCategories!.course,
      ),
    /already exists/,
  );
  assert.equal(
    categoryName("Empty category", data.settings!.contentCategories!.brief),
    "Empty category",
  );
  const legacy = orderedCourseCategories(data.content);
  assert.deepEqual(
    orderedCourseCategories(data.content, {
      contentCategories: { course: [...legacy].reverse(), brief: [] },
    }),
    [...legacy].reverse(),
  );
  assert(
    !orderedCourseCategories(data.content, data.settings).includes(
      "Empty category",
    ),
  );
});

test("public settings expose only published category names, and restored labels need repair rather than recreation", () => {
  const { data } = fixture();
  data.settings!.contentCategories!.course.push("Draft only");
  const item = data.content.find((item) => item.kind === "course")!;
  const prior = item.category;
  item.category = "Removed category";
  assert(
    !availableCategories(data.content, "course", data.settings).includes(
      "Removed category",
    ),
  );
  assert(
    categoryItems(
      data.content,
      data.publishedContent!,
      "course",
      undefined,
      data.settings!.contentCategories,
    ).some((entry) => entry.id === item.id),
  );
  assert.throws(
    () => assertContentCategory(item, data.settings!),
    /no longer available/,
  );
  assert(
    !publicSettings(
      data.settings!,
      data.publishedContent,
    ).contentCategories!.course.includes("Draft only"),
  );
  assert(
    publicSettings(
      data.settings!,
      data.publishedContent,
    ).contentCategories!.course.includes(prior),
  );
});

test("managed empty destinations work and metadata moves update published-only references without publishing draft edits", () => {
  const { data, actor } = fixture();
  const item = data.content.find((item) => item.kind === "brief")!;
  const live = data.publishedContent!.find((entry) => entry.id === item.id)!;
  data.settings!.contentCategories!.brief.push("Destination");
  const source = live.category;
  item.category = "Destination";
  item.body = "Unpublished body";
  const originalBody = live.body,
    originalDates = [item.updatedAt, item.feedAt, item.version];
  assert.deepEqual(metadataPatch(data, item, "category", "Destination"), {
    category: "Destination",
  });
  const result = applyDemoBulk(data, actor, {
    entity: "content",
    operation: "category",
    value: "Destination",
    items: [{ id: item.id, expected: item.revision! }],
  });
  assert.equal(result.results[0].status, "changed");
  assert.equal(
    result.data.publishedContent!.find((entry) => entry.id === item.id)!
      .category,
    "Destination",
  );
  assert.equal(
    result.data.publishedContent!.find((entry) => entry.id === item.id)!.body,
    originalBody,
  );
  const draft = result.data.content.find((entry) => entry.id === item.id)!;
  assert.equal(draft.body, "Unpublished body");
  assert.deepEqual(
    [draft.updatedAt, draft.feedAt, draft.version],
    originalDates,
  );
  assert.equal(
    data.publishedContent!.find((entry) => entry.id === item.id)!.category,
    source,
  );
});

test("category removal examines both copies and save retains a source until all moves succeed", async () => {
  const { data, actor } = fixture();
  const item = data.content.find((entry) => entry.kind === "course")!;
  const source = item.category;
  const targets = data.content.filter(
    (entry) => entry.kind === "course" && entry.category === source,
  );
  const settings = {
    ...data.settings!,
    contentCategories: {
      ...data.settings!.contentCategories!,
      course: data
        .settings!.contentCategories!.course.filter((name) => name !== source)
        .concat("New destination"),
    },
  };
  assert.throws(
    () =>
      assertCategoriesCanBeRemoved(
        data.settings!,
        settings.contentCategories,
        data.publishedContent!,
      ),
    /published copy/,
  );
  let current = structuredClone(data),
    writes = 0;
  const moves = targets.map((entry) => ({
    id: entry.id,
    kind: "course" as const,
    category: "New destination",
    expected: entry.revision!,
  }));
  const result = await saveCategorySettings(
    data,
    settings,
    moves,
    async (_, next) => {
      assertCategoriesCanBeRemoved(current.settings!, next.contentCategories!, [
        ...current.content,
        ...current.publishedContent!,
      ]);
      writes++;
      current.settings = next;
      return structuredClone(current);
    },
    async (request) => {
      const result = applyDemoBulk(current, actor, request);
      current = result.data;
      return result;
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(writes, 2);
  assert(!result.data.settings!.contentCategories!.course.includes(source));
  assert.deepEqual(result.data.deletedItems || [], data.deletedItems || []);
  current = structuredClone(data);
  current.content.find((entry) => entry.id === item.id)!.revision!++;
  const partial = await saveCategorySettings(
    data,
    settings,
    moves,
    async (_, next) => {
      current.settings = next;
      return structuredClone(current);
    },
    async (request) => {
      const result = applyDemoBulk(current, actor, request);
      current = result.data;
      return result;
    },
  );
  assert(partial.error);
  assert(partial.data.settings!.contentCategories!.course.includes(source));
  assert.deepEqual(
    partial.remaining.map((move) => move.id),
    [item.id],
  );
});

test("case-only renames do not create duplicate interim categories", async () => {
  const { data, actor } = fixture();
  const item = data.content.find((entry) => entry.kind === "course")!;
  const source = item.category,
    target = source.toUpperCase();
  const settings = {
    ...data.settings!,
    contentCategories: {
      ...data.settings!.contentCategories!,
      course: data.settings!.contentCategories!.course.map((name) =>
        name === source ? target : name,
      ),
    },
  };
  let current = structuredClone(data);
  const result = await saveCategorySettings(
    data,
    settings,
    data.content
      .filter((entry) => entry.kind === "course" && entry.category === source)
      .map((entry) => ({
        id: entry.id,
        kind: "course",
        category: target,
        expected: entry.revision!,
      })),
    async (_, next) => {
      assert.equal(
        next.contentCategories!.course.filter(
          (name) => name.toLowerCase() === source.toLowerCase(),
        ).length,
        1,
      );
      current.settings = next;
      return current;
    },
    async (request) => {
      const result = applyDemoBulk(current, actor, request);
      current = result.data;
      return result;
    },
  );
  assert.equal(result.error, undefined);
});

test("lost move responses are confirmed against actual publication, without resending", async () => {
  const { data } = fixture();
  const item = data.content.find((entry) => entry.kind === "course")!;
  const current = structuredClone(data);
  current.content.find((entry) => entry.id === item.id)!.category = "Target";
  let metadataWrites = 0;
  const save = createCategorySettingsSaver(
    async (path, body) => {
      if (path === "/api/settings") {
        current.settings = (body as any).settings;
        return { revision: 2, settings: current.settings };
      }
      if (path === "/api/admin/bulk") {
        metadataWrites++;
        throw new Error("Response lost");
      }
      if (path.startsWith("/api/content"))
        return current.publishedContent!.find((entry) => entry.id === item.id)!;
      throw new Error("Unexpected request");
    },
    async () => structuredClone(current),
  );
  const settings = {
    ...defaultSettings,
    ...data.settings!,
    contentCategories: {
      ...data.settings!.contentCategories!,
      course: data.settings!.contentCategories!.course.concat("Target"),
    },
  };
  // Use the same settings baseline; the move itself remains unconfirmed because the published category differs.
  const result = await save(data, settings, [
    {
      id: item.id,
      kind: "course",
      category: "Target",
      expected: item.revision!,
    },
  ]);
  assert.equal(metadataWrites, 1);
  assert.equal(result.remaining.length, 1);
  assert.match(result.error!, /unconfirmed/);
});
