import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import {
  audienceOptions,
  audienceCoverage,
  audienceSummary,
  updateMatchesAudience,
} from "../lib/content-audiences";
import { updatesForUser } from "../lib/learning-groups";
import { guest, guestRecommendations } from "../lib/guest-recommendations";
import {
  withPublishedSnapshots,
  reconcileDemoPublication,
  hasUnpublishedEdits,
} from "../lib/demo-publication";

function fixture() {
  const data = freshWorkspace();
  data.settings = {
    ...data.settings!,
    access: "public",
    guestGroupId: "external",
  };
  data.groups = [
    { id: "sales-group", name: "Account executives" },
    { id: "external", name: "Visitors" },
    { id: "empty", name: "Empty" },
  ];
  data.teams = [
    { id: "org", name: "Organization", system: "organization" },
    { id: "sales", name: "Sales", parentId: "org" },
    { id: "ae", name: "Account executives", parentId: "sales" },
    { id: "other", name: "Support", parentId: "org" },
  ];
  data.users = data.users.slice(0, 3).map((u, i) => ({
    ...u,
    id: `person-${i}`,
    active: true,
    groups: i === 0 ? ["sales-group"] : [],
    teamId: i === 0 ? "ae" : i === 1 ? "other" : undefined,
  }));
  return data;
}
test("Organization covers every registered audience, parent teams cover descendants, and configured guests remain separate", () => {
  const data = fixture(),
    options = audienceOptions(data);
  assert.equal(options[0].id, "org");
  assert.deepEqual(
    audienceCoverage(
      data,
      options.find((a) => a.id === "external")!,
      ["team:org"],
    ),
    [],
  );
  assert.equal(
    audienceCoverage(
      data,
      options.find((a) => a.id === "empty")!,
      ["team:org"],
    )[0].id,
    "org",
  );
  assert.equal(
    audienceCoverage(
      data,
      options.find((a) => a.id === "ae" && a.kind === "team")!,
      ["team:sales"],
    )[0].id,
    "sales",
  );
  assert.deepEqual(
    audienceCoverage(
      data,
      options.find((a) => a.id === "other")!,
      ["team:sales"],
    ),
    [],
  );
  assert.equal(
    audienceSummary(data, ["team:org", "team:sales", "group:sales-group"]),
    "Everyone in the organization · 3 people",
  );
  assert.match(
    audienceSummary(data, ["team:org", "group:external"]),
    /3 people · Public guests also included/,
  );
  data.settings!.access = "private";
  assert(!audienceOptions(data).some((a) => a.publicGuests));
});
test("group overlap describes current membership and does not confuse empty or growing groups with inherited teams", () => {
  const data = fixture(),
    options = audienceOptions(data),
    group = options.find((a) => a.id === "sales-group")!;
  assert.equal(audienceCoverage(data, group, ["team:sales"]).length, 1);
  data.users[1].groups = ["sales-group"];
  assert.deepEqual(audienceCoverage(data, group, ["team:sales"]), []);
  assert.deepEqual(
    audienceCoverage(
      data,
      options.find((a) => a.id === "empty")!,
      ["team:sales"],
    ),
    [],
  );
});
test("linked groups structurally cover teams and future subteams even with no current members", () => {
  const data = fixture();
  data.groups[0].teamIds = ["sales"];
  data.users = [];
  const team = audienceOptions(data).find(
    (a) => a.kind === "team" && a.id === "ae",
  )!;
  assert.equal(
    audienceCoverage(data, team, ["group:sales-group"])[0].id,
    "sales-group",
  );
  data.teams!.push({ id: "future", name: "New branch", parentId: "ae" });
  const future = audienceOptions(data).find((a) => a.id === "future")!;
  assert.equal(
    audienceCoverage(data, future, ["group:sales-group"])[0].id,
    "sales-group",
  );
  assert.deepEqual(audienceCoverage(data, future, []), []);
});
test("manual person overlap and legacy direct-only group links do not cover a team branch", () => {
  const data = fixture();
  const team = audienceOptions(data).find(
    (a) => a.kind === "team" && a.id === "ae",
  )!;
  assert.deepEqual(audienceCoverage(data, team, ["group:sales-group"]), []);
  data.groups[0].teamIds = ["ae"];
  data.groups[0].teamLinkScope = "direct";
  assert.deepEqual(audienceCoverage(data, team, ["group:sales-group"]), []);
  data.groups[0].teamLinkScope = "subtree";
  assert.equal(
    audienceCoverage(data, team, ["group:sales-group"])[0].id,
    "sales-group",
  );
});
test("Update audience drafts preserve live targeting until publication, include Organization fallback and never include guests via teams", () => {
  let data = withPublishedSnapshots(fixture());
  const original = data.content.find((c) => c.kind === "brief")!;
  original.groups = [];
  data.content = [original];
  data.publishedContent = [structuredClone(original)];
  const draft = {
    ...original,
    status: "draft" as const,
    updateTeams: ["sales"],
  };
  data = reconcileDemoPublication(data, { ...data, content: [draft] });
  assert(hasUnpublishedEdits(data.content[0], data.publishedContent![0]));
  assert.equal(
    updatesForUser(
      data.publishedContent!,
      data.users[0],
      data.groups,
      data.teams,
    ).forYou.length,
    0,
  );
  data = reconcileDemoPublication(data, {
    ...data,
    content: [{ ...data.content[0], status: "published" }],
  });
  assert.equal(
    updatesForUser(
      data.publishedContent!,
      data.users[0],
      data.groups,
      data.teams,
    ).forYou.length,
    1,
  );
  assert.equal(
    updatesForUser(
      data.publishedContent!,
      data.users[1],
      data.groups,
      data.teams,
    ).forYou.length,
    0,
  );
  assert(
    updateMatchesAudience(
      { ...draft, updateTeams: ["org"] },
      data.users[2],
      data.groups,
      data.teams,
    ),
  );
  assert(
    !updateMatchesAudience(
      { ...draft, updateTeams: ["org"] },
      guest,
      data.groups,
      data.teams,
    ),
  );
  assert(
    !updateMatchesAudience(
      { ...draft, updateTeams: ["removed"] },
      data.users[0],
      data.groups,
      data.teams,
    ),
  );
  data.content = [{ ...data.publishedContent![0], updateTeams: ["org"] }];
  let projection = guestRecommendations(data);
  assert.equal(
    updatesForUser(projection.content, projection.user, projection.groups)
      .forYou.length,
    0,
  );
  data.content[0].groups = ["external"];
  projection = guestRecommendations(data);
  assert.equal(
    updatesForUser(projection.content, projection.user, projection.groups)
      .forYou.length,
    1,
  );
  assert.equal(projection.content[0].updateTeams, undefined);
});
