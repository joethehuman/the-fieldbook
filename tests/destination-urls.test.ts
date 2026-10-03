import test from "node:test";
import assert from "node:assert/strict";
import {
  adminHref,
  adminPaths,
  adminScope,
  parseAdminDestination,
  type AdminDestination,
} from "../lib/admin-destination";
import { courseLibraryView, courseViewPaths } from "../lib/course-destination";
import { teamHref, teamPersonId } from "../lib/team-destination";
import { canOpenAdminTab } from "../lib/permissions";

test("every core Admin destination round-trips and selects an authorized data scope", () => {
  for (const tab of Object.keys(adminPaths) as (keyof typeof adminPaths)[]) {
    const destination = { tab };
    assert.deepEqual(
      parseAdminDestination(adminHref(destination)),
      destination,
    );
    assert.ok(adminScope(destination));
  }
  assert.deepEqual(parseAdminDestination("/admin"), { tab: "content" });
  assert.equal(adminScope({ tab: "progress" }), "progress");
  assert.equal(adminScope({ tab: "people", id: "p" }), "person");
  assert.equal(adminScope({ tab: "people", id: "p", view: "edit" }), "people");
});
test("record, nested and new destinations survive URL serialization", () => {
  const destinations: AdminDestination[] = [
    { tab: "content", id: "a b", view: "edit" },
    { tab: "people", id: "person", view: "edit" },
    { tab: "people", id: "person" },
    { tab: "teams", id: "team", panel: "subteams" },
    { tab: "groups", id: "group", panel: "learning" },
    { tab: "curricula", id: "curriculum", view: "edit" },
    { tab: "progress", id: "person" },
    { tab: "content", create: "course" },
    { tab: "people", create: "person" },
    { tab: "curricula", create: "curriculum" },
  ];
  for (const destination of destinations)
    assert.deepEqual(
      parseAdminDestination(adminHref(destination)),
      destination,
    );
});
test("unknown paths and malformed or path-shaped IDs cannot select an Admin screen", () => {
  for (const path of [
    "/admin/secret",
    "/admin/content/id",
    "/admin/people/a/delete",
    "/admin/groups/a/edit",
    "/admin/teams/a/updates",
    "/admin/content/new/person",
    "/admin/content/%2F/edit",
    "/admin/content/%/edit",
  ])
    assert.equal(parseAdminDestination(path), null, path);
  const contributor = { role: "contributor" as const, active: true };
  assert.equal(
    canOpenAdminTab(contributor, parseAdminDestination("/admin/people")!.tab),
    false,
  );
  assert.equal(
    canOpenAdminTab(
      contributor,
      parseAdminDestination("/admin/settings/mcp")!.tab,
    ),
    true,
  );
});
test("course collections and team details have stable, distinct destinations", () => {
  for (const [view, path] of Object.entries(courseViewPaths))
    assert.equal(courseLibraryView(path), view);
  assert.equal(courseLibraryView("/courses/a-course"), undefined);
  assert.equal(teamPersonId(teamHref("person id")), "person id");
  assert.equal(teamPersonId("/team/people/%2F"), undefined);
});
