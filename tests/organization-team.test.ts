import test from "node:test";
import assert from "node:assert/strict";
import { organizationTeam } from "../lib/organization-team";
import { defaultSettings, publicSettings } from "../lib/settings";
import { settingsSchema } from "../server/schemas";
import type { Team } from "../lib/types";

const teams: Team[] = [
  { id: "organization", name: "Company" },
  { id: "sales", name: "Sales", parentId: "organization" },
  { id: "us", name: "US", parentId: "sales" },
];

test("Organization team uses an explicit stable ID and the sole actual root", () => {
  const before = structuredClone(teams);
  assert.equal(organizationTeam(teams, "organization"), teams[0]);
  assert.equal(organizationTeam(teams), undefined);
  assert.equal(organizationTeam(teams, null), undefined);
  assert.equal(organizationTeam(teams, "Company"), undefined);
  const renamed = teams.map((team) => ({
    ...team,
    name: `Renamed ${team.name}`,
  }));
  assert.equal(organizationTeam(renamed, "organization"), renamed[0]);
  assert.deepEqual(teams, before);
});

test("stale, parented, missing and multiple-root designations retain the ordinary browser", () => {
  assert.equal(organizationTeam(teams, "missing"), undefined);
  assert.equal(organizationTeam(teams, "sales"), undefined);
  assert.equal(organizationTeam([], "organization"), undefined);
  assert.equal(
    organizationTeam(
      [...teams, { id: "support", name: "Support" }],
      "organization",
    ),
    undefined,
  );
  assert.equal(
    organizationTeam([{ ...teams[0], parentId: "missing" }], "organization"),
    undefined,
  );
});

test("Organization team is optional settings data and never a public team identifier", () => {
  assert.equal(defaultSettings.organizationTeamId, null);
  for (const organizationTeamId of [undefined, null, "organization"]) {
    const settings = settingsSchema.parse({
      ...defaultSettings,
      organizationTeamId,
    });
    assert.equal(settings.organizationTeamId, organizationTeamId);
    assert.equal("organizationTeamId" in publicSettings(settings), false);
  }
  for (const organizationTeamId of ["", "a".repeat(81), 42, ["organization"]])
    assert.equal(
      settingsSchema.safeParse({ ...defaultSettings, organizationTeamId })
        .success,
      false,
    );
});
