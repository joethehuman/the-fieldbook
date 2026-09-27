import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace, type Workspace } from "../lib/store";
import {
  contentRelationshipCommands,
  curriculumGroupCommands,
} from "../components/bulk-relationships";
import { peopleCommands } from "../components/PeopleBulkActions";
import { groupItems } from "../lib/learning-groups";

test("course group batches deduplicate direct links and preserve unrelated data and history", async () => {
  const data = freshWorkspace();
  const course = data.content.find((c) => c.kind === "course")!;
  const group = data.groups[0];
  let saved: Workspace = data;
  const commands = contentRelationshipCommands(
    data,
    [course.id],
    (d) => {
      saved = d;
    },
    async () => {},
  );
  await commands.find((c) => c.id === "group-add")!.apply([group.id]);
  assert.equal(
    groupItems(saved.groups[0], saved.content).filter(
      (i) => i.kind === "course" && i.id === course.id,
    ).length,
    1,
  );
  assert.deepEqual(saved.users, data.users);
  assert.deepEqual(saved.progress, data.progress);
  const other = saved.groups.slice(1);
  await contentRelationshipCommands(
    saved,
    [course.id],
    (d) => {
      saved = d;
    },
    async () => {},
  )
    .find((c) => c.id === "group-remove")!
    .apply([group.id]);
  assert(
    !groupItems(saved.groups[0], saved.content).some(
      (i) => i.kind === "course" && i.id === course.id,
    ),
  );
  assert.deepEqual(saved.groups.slice(1), other);
  assert.deepEqual(saved.content, data.content);
});
test("mixed content has no relationship commands and draft curricula cannot be assigned", () => {
  const data = freshWorkspace();
  const course = data.content.find((c) => c.kind === "course")!;
  const update = data.content.find((c) => c.kind === "brief")!;
  assert.deepEqual(
    contentRelationshipCommands(
      data,
      [course.id, update.id],
      () => {},
      async () => {},
    ),
    [],
  );
  data.curricula = [
    {
      id: "draft",
      name: "Draft",
      description: "",
      status: "draft",
      courseIds: [],
    },
  ];
  assert.match(
    curriculumGroupCommands(data, ["draft"], () => {})[0].disabledReason!,
    /Publish/,
  );
});
test("people batch deactivation blocks the current administrator and preserves history", async () => {
  const data = freshWorkspace();
  const admin = data.users.find((u) => u.role === "admin")!;
  const learner = data.users.find((u) => u.role === "learner")!;
  const self = peopleCommands(data, [admin.id], () => {}, false, admin.id).find(
    (c) => c.id === "inactive",
  )!;
  assert(self.disabledReason);
  await assert.rejects(async () => self.apply([]), /own administrator/);
  let saved = data;
  await peopleCommands(
    data,
    [learner.id],
    (d) => {
      saved = d;
    },
    false,
    admin.id,
  )
    .find((c) => c.id === "inactive")!
    .apply([]);
  assert.equal(saved.users.find((u) => u.id === learner.id)!.active, false);
  assert.deepEqual(saved.progress, data.progress);
});
