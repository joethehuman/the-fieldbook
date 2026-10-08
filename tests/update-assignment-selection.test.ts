import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import {
  initialUpdateSelection,
  updateSelectionActions,
  updateSelectionOptions,
} from "../lib/update-assignment-selection";

function fixture() {
  const data = freshWorkspace();
  const update = data.content.find((item) => item.kind === "brief")!;
  data.groups = [
    { id: "sales", name: "Sales group" },
    { id: "support", name: "Support group" },
  ];
  data.teams = [
    { id: "org", name: "Organization", system: "organization" },
    { id: "sales", name: "Sales", parentId: "org" },
    { id: "child", name: "Child", parentId: "sales" },
  ];
  data.publishedContent = [
    {
      ...update,
      id: "first",
      status: "published",
      groups: ["sales"],
      updateTeams: ["sales"],
      revision: 4,
    },
    {
      ...update,
      id: "second",
      status: "published",
      groups: ["support"],
      updateTeams: [],
      revision: 7,
    },
  ];
  data.content = data.publishedContent.map((item) => ({
    ...item,
    revision: item.revision! + 1,
  }));
  return data;
}

test("live Update group editing leaves saved team sources untouched and uses current draft revisions", () => {
  const data = fixture();
  const target = { kind: "items", ids: ["first"], mode: "add" } as const;
  const request = { ...target, ids: [...target.ids] };
  assert.deepEqual(initialUpdateSelection(data, request), ["group:sales"]);
  assert.deepEqual(updateSelectionActions(data, request, ["group:support"]), [
    {
      operation: "untarget",
      contentId: "first",
      expected: 5,
      groupId: "sales",
    },
    {
      operation: "target",
      contentId: "first",
      expected: 5,
      groupId: "support",
    },
  ]);
  assert.equal(data.publishedContent![0].updateTeams![0], "sales");
});

test("single audience editing can clear its recommendations without changing other audiences", () => {
  const data = fixture();
  const target = {
    kind: "audiences" as const,
    keys: ["group:sales"],
    mode: "add" as const,
  };
  assert.deepEqual(initialUpdateSelection(data, target), ["first"]);
  assert.deepEqual(updateSelectionActions(data, target, []), [
    {
      operation: "untarget",
      contentId: "first",
      expected: 5,
      groupId: "sales",
    },
  ]);
});

test("batch additions apply missing pairs only; matching current people do not substitute for direct sources", () => {
  const data = fixture();
  assert.deepEqual(
    updateSelectionActions(
      data,
      { kind: "items", ids: ["first", "second"], mode: "add" },
      ["group:sales"],
    ),
    [
      {
        operation: "target",
        contentId: "second",
        expected: 8,
        groupId: "sales",
      },
    ],
  );
  assert.deepEqual(
    updateSelectionActions(
      data,
      {
        kind: "audiences",
        keys: ["group:sales", "group:support"],
        mode: "add",
      },
      ["first"],
    ),
    [
      {
        operation: "target",
        contentId: "first",
        expected: 5,
        groupId: "support",
      },
    ],
  );
});

test("removal choices contain direct links only and reject invalid audiences", () => {
  const data = fixture();
  const target = {
    kind: "items" as const,
    ids: ["first"],
    mode: "remove" as const,
  };
  assert.deepEqual(
    updateSelectionOptions(data, target)
      .map((option) => option.id)
      .sort(),
    ["group:sales"],
  );
  assert.throws(
    () => updateSelectionActions(data, target, ["team:child"]),
    /changed/,
  );
  assert.throws(
    () =>
      updateSelectionActions(
        data,
        { kind: "audiences", keys: ["user:someone"], mode: "add" },
        ["first"],
      ),
    /changed/,
  );
});

test("an empty patch emits no writes and a complete empty selection removes all direct sources", () => {
  const data = fixture();
  assert.deepEqual(
    updateSelectionActions(
      data,
      { kind: "items", ids: ["first", "second"], mode: "add" },
      [],
    ),
    [],
  );
  assert.equal(
    updateSelectionActions(
      data,
      { kind: "items", ids: ["first"], mode: "add" },
      [],
    ).length,
    1,
  );
});

test("live recommendation pickers offer only groups; teams remain managed in the Update editor", () => {
  const data = fixture();
  const target = {
    kind: "items" as const,
    ids: ["first"],
    mode: "add" as const,
  };
  assert.deepEqual(
    updateSelectionOptions(data, target).map((option) => option.id),
    ["group:sales", "group:support"],
  );
  assert.throws(
    () => updateSelectionActions(data, target, ["team:sales"]),
    /changed/,
  );
  assert.throws(
    () =>
      updateSelectionActions(
        data,
        { kind: "audiences", keys: ["team:sales"], mode: "add" },
        ["second"],
      ),
    /changed/,
  );
  assert.deepEqual(data.publishedContent![0].updateTeams, ["sales"]);
});
