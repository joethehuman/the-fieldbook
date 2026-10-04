import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkActions, ItemActions } from "../components/patterns/bulk-actions";
import { TooltipProvider } from "../components/ui/tooltip";
import { ToastProvider } from "../components/ui/toast";
import { adminCommands } from "../components/AdminBulkActions";
import { freshWorkspace } from "../lib/store";
import type { BulkRequest } from "../lib/bulk-actions";

const commands = [
  {
    id: "delete",
    label: "Delete selected",
    description: "Review deletion.",
    apply: () => {},
  },
];
function markup(selected: string[], total = 3) {
  return renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(BulkActions, {
        selected,
        collectionSize: total,
        onSelectionChange: () => {},
        commands,
      }),
    ),
  );
}
test("bulk menu requires two distinct record IDs, independently of header or collection size", () => {
  for (const selected of [[], ["one"], ["one", "one"]])
    assert.match(markup(selected), /disabled=""[^>]*><span[^>]*>Bulk actions/);
  assert.doesNotMatch(
    markup(["one", "two"]),
    /disabled=""[^>]*><span[^>]*>Bulk actions/,
  );
  for (const total of [0, 1])
    assert.doesNotMatch(markup(["one"], total), /Bulk actions|>Actions</);
});
test("single-record menu remains reachable without bulk controls or implicit selection", () => {
  const html = renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(ItemActions, { id: "one", label: "Only record", commands }),
    ),
  );
  assert.match(html, /Actions for Only record/);
  assert.doesNotMatch(html, /Bulk actions|Selected items/);
});
test("shared admin command snapshots source IDs and revisions and returns exact failed targets", async () => {
  const data = freshWorkspace();
  const [first, second] = data.content;
  first.revision = 5;
  second.revision = 8;
  let request: BulkRequest | undefined;
  const command = adminCommands({
    data,
    selected: [first.id, second.id],
    onBulk: async (value) => {
      request = value;
      return [{ id: first.id, status: "failed", message: "Revision changed" }];
    },
  }).find((c) => c.id === "delete")!;
  const result = await command.apply([], [first.id]);
  assert.deepEqual(request?.items, [{ id: first.id, expected: 5 }]);
  assert.deepEqual(result && result.failed, [first.id]);
  assert.match((result && result.details?.[0]) || "", /Revision changed/);
  assert.ok(command.acknowledgment);
});

test("group Update lists retain individual action targets for one item and stable four-column rows", async () => {
  const { default: LearningGroups } =
    await import("../components/LearningGroups");
  const { InteractionDialogProvider } =
    await import("../components/ui/interaction-dialog");
  const data = freshWorkspace();
  const group = data.groups[0];
  const update = data.content.find((item) => item.kind === "brief")!;
  update.groups = [group.id];
  data.content = [update];
  data.publishedContent = [{ ...update, status: "published" }];
  const html = renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(
        InteractionDialogProvider,
        null,
        createElement(LearningGroups, {
          data,
          onChange: () => {},
          onLearning: async () => {},
          initialGroup: group.id,
          initialTab: "updates",
        }),
      ),
    ),
  );
  assert.match(
    html,
    new RegExp(
      `Actions for ${update.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
  assert.doesNotMatch(html, /Bulk actions/);
  const table =
    html.match(/<table[^>]*data-layout="groupUpdates"[\s\S]*?<\/table>/)?.[0] ||
    "";
  assert.equal((table.match(/<col class=/g) || []).length, 4);
  assert.equal((table.match(/<td /g) || []).length, 4);
});

test("single direct group member has a row action without a bulk-selection fallback", async () => {
  const { default: LearningGroups } =
    await import("../components/LearningGroups");
  const { InteractionDialogProvider } =
    await import("../components/ui/interaction-dialog");
  const data = freshWorkspace();
  const group = data.groups[0];
  group.teamIds = [];
  group.legacyDirectTeamIds = [];
  const person = {
    ...data.users[0],
    name: "Direct fixture",
    groups: [group.id],
  };
  data.users = [person];
  const html = renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(
        InteractionDialogProvider,
        null,
        createElement(LearningGroups, {
          data,
          onChange: () => {},
          onLearning: async () => {},
          initialGroup: group.id,
          initialTab: "people",
        }),
      ),
    ),
  );
  assert.match(html, /Actions for Direct fixture/);
  assert.doesNotMatch(html, /Bulk actions/);
});

test("Organization roster retains a single-user move menu without changing the root model", async () => {
  const { TeamsAdmin } = await import("../components/TeamManagement");
  const { InteractionDialogProvider } =
    await import("../components/ui/interaction-dialog");
  const data = freshWorkspace();
  const root = data.teams!.find((t) => t.system === "organization")!;
  data.users = [
    { ...data.users[0], name: "Organization fixture", teamId: undefined },
  ];
  const html = renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(
        InteractionDialogProvider,
        null,
        createElement(
          TooltipProvider,
          null,
          createElement(TeamsAdmin, {
            data,
            onChange: () => {},
            initialTeam: root.id,
            initialTab: "members",
          }),
        ),
      ),
    ),
  );
  assert.match(html, /Actions for Organization fixture/);
  assert.doesNotMatch(html, /Bulk actions/);
});
