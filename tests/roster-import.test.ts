import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { freshWorkspace, type Workspace } from "../lib/store";
import { serializeCsv } from "../lib/csv";
import { organizationTeam } from "../lib/organization-team";
import {
  parseRosterCsv,
  prepareRosterCsv,
  materializeRoster,
  reviewRosterCsv,
  rosterTemplate,
  rosterExample,
  rosterIssueReport,
  ROSTER_IMPORT_MAX_BYTES,
  ROSTER_IMPORT_MAX_ROWS,
} from "../lib/roster-import";
const csv = (rows: string[][]) => serializeCsv({ ...rosterTemplate(), rows });
function base(): Workspace {
  const d = freshWorkspace(),
    root = organizationTeam(d.teams!, d.settings!.organizationTeamId)!;
  d.teams = [
    root,
    { id: "us", name: "US", parentId: root.id },
    { id: "eu", name: "EMEA", parentId: root.id },
  ];
  d.users = [
    {
      id: "admin",
      name: "Owner",
      email: "owner@example.test",
      role: "admin",
      active: true,
      groups: [],
    },
    {
      id: "one",
      name: "Alex",
      email: "alex@example.test",
      role: "learner",
      active: true,
      registered: false,
      groups: [],
      teamId: "us",
      hireDate: "2026-09-01",
      onboardingDays: 90,
    },
  ];
  const course = {
    ...d.content.find((c) => c.kind === "course")!,
    id: "course-a",
    title: "Discovery",
    groups: [],
    assignments: [],
    status: "published" as const,
  };
  d.content = [course];
  d.publishedContent = structuredClone(d.content);
  d.groups = [
    {
      id: "g",
      name: "US audience",
      teamIds: ["us"],
      learningItems: [{ kind: "course", id: "course-a" }],
    },
  ];
  d.curricula = [];
  d.progress = {
    one: [
      {
        content_id: "course-a",
        version: course.version,
        lessons: ["one"],
        passed: true,
      },
    ],
  };
  d.governanceRevision = 10;
  return d;
}
test("stored blank templates match both apps and filled-in examples are not public downloads", () => {
  for (const dir of ["public", "demo/public"]) {
    assert.equal(
      readFileSync(dir + "/templates/people-import-template.csv", "utf8"),
      serializeCsv(rosterTemplate()),
    );
    assert.equal(
      existsSync(dir + "/templates/people-import-example.csv"),
      false,
    );
  }
  const review = reviewRosterCsv(serializeCsv(rosterExample()), base());
  assert.equal(review.valid, true);
  assert.equal(review.people.filter((r) => r.status === "new").length, 4);
  assert.equal(review.teams.length, 6);
});
test("quoted names, newlines, BOM, CRLF and reordered case-insensitive headings parse", () => {
  const input = parseRosterCsv(
    '\uFEFFemail,NAME,hire date,TEAM,parent team,team manager email\r\nnew@example.test,"Doe, \"\"Jo\"\"\nLee",2026-09-01,US,,\r\n',
  );
  assert.equal(input.issues.length, 0);
  assert.equal(input.people[0].name, 'Doe, "Jo"\nLee');
  assert.equal(input.people[0].row, 2);
});
test("new/changed/unchanged proposals preserve stable identities, optional blanks, omissions and the original workspace", () => {
  const d = base(),
    before = JSON.stringify(d);
  const result = reviewRosterCsv(
    csv([
      ["", " ALEX@example.test ", "", "", "", ""],
      ["Taylor", "taylor@example.test", "", "", "", ""],
    ]),
    d,
  );
  assert.equal(result.valid, true);
  assert.equal(result.people[0].id, "one");
  assert.equal(result.people[0].status, "unchanged");
  assert.equal(
    result.people[1].changes.find((c) => c.field === "Team")!.after,
    "Organization",
  );
  assert.ok(
    result.issues.some(
      (i) => i.code === "missing-hire-date" && i.severity === "notice",
    ),
  );
  assert.equal(JSON.stringify(d), before);
});
test("parents and pending managers resolve anywhere in the file and repeated blank definitions do not overwrite", () => {
  const d = base();
  const result = reviewRosterCsv(
    csv([
      [
        "Jo",
        "jo@example.test",
        "2026-09-01",
        "Leaf",
        "Parent",
        "boss@example.test",
      ],
      ["Kim", "kim@example.test", "", "Leaf", "", ""],
      [
        "Boss",
        "boss@example.test",
        "",
        "Parent",
        "Organization",
        "boss@example.test",
      ],
    ]),
    d,
  );
  assert.equal(result.valid, true);
  assert.equal(result.teams.filter((r) => r.name === "Leaf").length, 1);
  assert.equal(
    result.teams
      .find((r) => r.name === "Leaf")!
      .changes.find((c) => c.field === "Parent team")!.after,
    "Parent",
  );
  assert.ok(
    result.people
      .find((r) => r.name === "Boss")!
      .changes.some((c) => c.field === "Access" && c.after === "Manager"),
  );
});
test("explicit Organization moves an existing person and keeps administrator/contributor access", () => {
  const d = base();
  d.users[1].role = "contributor";
  const result = reviewRosterCsv(
    csv([
      ["", "alex@example.test", "", "Organization", "", "owner@example.test"],
    ]),
    d,
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "protected-root"));
  const moved = reviewRosterCsv(
    csv([["", "alex@example.test", "", "Organization", "", ""]]),
    d,
  );
  assert.equal(moved.valid, true);
  assert.equal(
    moved.people[0].changes.find((c) => c.field === "Team")!.after,
    "Organization",
  );
  assert.ok(!moved.people[0].changes.some((c) => c.field === "Access"));
});
test("a changed hire date shows the clock/type change but cannot change saved course deadlines or progress", () => {
  const d = base();
  d.users[1].learningAssignments = [
    {
      episodeId: "e",
      contentId: "course-a",
      version: 1,
      assignedAt: "2026-09-01",
      dueDate: "2026-11-30",
      catchUpDays: 7,
      sourceGroups: ["g"],
    },
  ];
  const before = JSON.stringify(d);
  const result = reviewRosterCsv(
    csv([["", "alex@example.test", "2025-01-01", "", "", ""]]),
    d,
    { stamp: "2026-10-02T00:00:00Z" },
  );
  assert.equal(result.valid, true);
  assert.ok(
    result.people[0].changes.some(
      (c) => c.field === "User type" && c.after === "Existing user",
    ),
  );
  assert.ok(result.people[0].notes.some((n) => n.includes("stay fixed")));
  assert.equal(JSON.stringify(d), before);
});
test("stale derived group projection is recomputed for learning and team-targeted Update consequences", () => {
  const d = base();
  d.users[1].effectiveGroupIds = ["g"];
  d.content.push({
    ...d.content[0],
    id: "update",
    kind: "brief",
    title: "Team news",
    groups: [],
    updateTeams: ["us"],
  });
  d.publishedContent = structuredClone(d.content);
  const result = reviewRosterCsv(
    csv([["", "alex@example.test", "", "EMEA", "", ""]]),
    d,
  );
  assert.equal(result.valid, true);
  const impact = result.impact.find((p) => p.id === "one")!;
  assert.deepEqual(impact.coursesRemoved, ["course-a"]);
  assert.equal(impact.updatesRemoved, 1);
});
test("overlapping direct group assignment survives a team move without removing its course", () => {
  const d = base();
  d.users[1].groups = ["g"];
  const result = reviewRosterCsv(
    csv([["", "alex@example.test", "", "EMEA", "", ""]]),
    d,
  );
  assert.equal(result.valid, true);
  assert.equal(result.impact.flatMap((p) => p.coursesRemoved).length, 0);
});
test("parent changes show affected members and reporting/learning consequences outside the uploaded people", () => {
  const d = base(),
    root = d.teams![0];
  d.teams!.push({ id: "leaf", name: "Leaf", parentId: "us" });
  d.users[1].teamId = "leaf";
  d.users.push({
    id: "m",
    name: "Manager",
    email: "manager@example.test",
    role: "manager",
    active: true,
    groups: [],
  });
  d.teams![1].managerId = "m";
  const result = reviewRosterCsv(csv([["", "", "", "Leaf", "EMEA", ""]]), d);
  assert.equal(result.valid, true);
  assert.deepEqual(result.teams[0].affected, ["one"]);
  assert.ok(result.people.find((p) => p.id === "one")?.status === "changed");
  assert.deepEqual(
    result.impact.find((p) => p.id === "one")!.reportingRemoved,
    ["Manager"],
  );
  assert.equal(d.teams!.find((t) => t.id === "leaf")!.parentId, "us");
  assert.ok(root.system);
});
test("blocking row conflicts, references, duplicates, inactive/deleted people and cycles are complete and never calculate partial impacts", () => {
  const d = base();
  d.users[1].active = false;
  const input = csv([
    [
      "",
      "alex@example.test",
      "2026-02-30",
      "US",
      "EMEA",
      "missing@example.test",
    ],
    ["New", "new@example.test", "", "US", "Organization", ""],
    ["Again", "NEW@example.test", "", "Loop", "Loop", ""],
  ]);
  const result = reviewRosterCsv(input, d, {
    deletedEmails: ["new@example.test"],
  });
  assert.equal(result.valid, false);
  const codes = new Set(result.issues.map((i) => i.code));
  for (const code of [
    "hire-date",
    "inactive-person",
    "team-parent-conflict",
    "missing-manager",
    "duplicate-person",
    "deleted-person",
    "cycle",
  ])
    assert.ok(codes.has(code), code);
  assert.equal(result.impact.length, 0);
  assert.equal(
    rosterIssueReport(result.issues).rows.length,
    result.issues.length,
  );
});
test("malformed files and real date boundaries return clear issues rather than crashing", () => {
  for (const file of [
    "",
    "Name,Email\nJo,x",
    csv([["Jo", "jo@example.test", "2025-02-29", "US", "", ""]]),
    'Name,Email,Hire date,Team,Parent team,Team manager email\n"unfinished',
    "\u0000binary",
  ]) {
    const result = reviewRosterCsv(file, base());
    assert.equal(result.valid, false);
    assert.ok(result.issues.length);
  }
  assert.equal(
    reviewRosterCsv(
      csv([["Jo", "jo@example.test", "2024-02-29", "US", "", ""]]),
      base(),
    ).valid,
    true,
  );
  assert.equal(
    parseRosterCsv("x".repeat(ROSTER_IMPORT_MAX_BYTES + 1)).issues[0].code,
    "file-size",
  );
});
test("the full row limit and 100 courses are reviewed as bounded metadata without mutating data", () => {
  const d = base();
  d.users = [d.users[0]];
  d.content = Array.from({ length: 100 }, (_, i) => ({
    ...d.content[0],
    id: "c" + i,
    title: "Course " + i,
  }));
  d.publishedContent = structuredClone(d.content);
  d.teams![1].learningItems = d.content.map((c) => ({
    kind: "course",
    id: c.id,
  }));
  d.groups = [];
  const people = ROSTER_IMPORT_MAX_ROWS - 1;
  const rows = Array.from({ length: people }, (_, i) => [
    "Person " + i,
    `person${i}@example.test`,
    "2026-09-01",
    "US",
    "",
    "",
  ]);
  rows.push(["", "", "", "Empty team", "US", ""]);
  const before = JSON.stringify(d),
    start = performance.now(),
    result = reviewRosterCsv(csv(rows.reverse()), d);
  assert.equal(result.valid, true);
  assert.equal(result.people.length, people);
  assert.equal(result.courses.length, 100);
  assert.equal(
    result.impact.reduce((n, p) => n + p.coursesAdded.length, 0),
    people * 100,
  );
  assert.ok(
    new TextEncoder().encode(JSON.stringify(result)).byteLength < 4_200_000,
    `Review payload is ${new TextEncoder().encode(JSON.stringify(result)).byteLength} bytes`,
  );
  assert.equal(JSON.stringify(d), before);
  console.log(
    JSON.stringify({
      scalePeople: people,
      scaleCourses: 100,
      reviewMs: Math.round(performance.now() - start),
      payloadBytes: JSON.stringify(result).length,
    }),
  );
  assert.equal(
    parseRosterCsv(
      csv([...rows, ["Overflow", "overflow@example.test", "", "", "", ""]]),
    ).issues[0].code,
    "row-limit",
  );
});

test("new roster dates are captured at apply, while existing known and unknown dates survive", () => {
  const data = base();
  data.users[0].addedAt = "2025-01-02T03:04:05.000Z";
  const prepared = prepareRosterCsv(
    csv([
      ["New", "new@example.test", "2020-01-01", "", "", ""],
      ["Alex renamed", "alex@example.test", "", "US", "", ""],
    ]),
    data,
  );
  assert.equal(prepared.review.valid, true);
  assert.equal(
    prepared.proposal!.users.find((p) => p.email === "new@example.test")!
      .addedAt,
    undefined,
  );
  const saved = materializeRoster(
    prepared.proposal!,
    prepared.review,
    () => "new-id",
    "2026-10-03T16:00:00.000Z",
  );
  assert.equal(
    saved.users.find((p) => p.email === "new@example.test")!.addedAt,
    "2026-10-03T16:00:00.000Z",
  );
  assert.equal(saved.users[0].addedAt, data.users[0].addedAt);
  assert.equal(
    saved.users.find((p) => p.email === "alex@example.test")!.addedAt,
    undefined,
  );
  assert.equal(
    materializeRoster(
      saved,
      { ...prepared.review, people: [] },
      () => "unused",
      "2027-01-01T00:00:00.000Z",
    ).users.find((p) => p.email === "new@example.test")!.addedAt,
    "2026-10-03T16:00:00.000Z",
  );
});

test("materializing new records preserves every existing ID, even one resembling a provisional reference", () => {
  const data = base();
  data.teams![1].id = "csv-preview:old-team";
  data.users[1].teamId = data.teams![1].id;
  const prepared = prepareRosterCsv(
    csv([["Alex", "alex@example.test", "", "US", "", ""]]),
    data,
  );
  assert.equal(prepared.review.valid, true);
  const saved = materializeRoster(
    prepared.proposal!,
    prepared.review,
    () => "allocated",
  );
  assert.equal(saved.teams![1].id, data.teams![1].id);
  assert.equal(saved.users[1].id, data.users[1].id);
  assert.equal(saved.users[1].teamId, data.teams![1].id);
});

test("review details resolve the complete final record, preserved blanks and calculated hierarchy", () => {
  const d = base();
  const review = reviewRosterCsv(
    csv([
      ["", "alex@example.test", "", "Leaf", "US", "boss@example.test"],
      ["Boss", "boss@example.test", "", "US", "", ""],
    ]),
    d,
  );
  assert.equal(review.valid, true);
  const alex = review.people.find((p) => p.id === "one")!;
  const field = (name: string) => alex.values.find((v) => v.field === name)!;
  assert.equal(field("Hire date").value, "2026-09-01");
  assert.equal(field("Hire date").source, "Kept");
  assert.equal(field("Email").value, "alex@example.test");
  assert.equal(field("Team").value, "Leaf");
  assert.equal(field("Team").source, "From CSV");
  assert.equal(field("Parent team").value, "US");
  assert.equal(field("Team manager").value, "Boss");
  assert.equal(field("Team manager email").value, "boss@example.test");
  assert.equal(field("Hierarchy").value, "Organization / US / Leaf");
  assert.equal(field("Hierarchy").source, "Calculated");
  assert.equal(
    review.people
      .find((p) => p.name === "Boss")!
      .values.find((v) => v.field === "Access")!.value,
    "Manager",
  );
  assert.equal(
    review.teams
      .find((t) => t.name === "Leaf")!
      .values.find((v) => v.field === "Parent team")!.value,
    "US",
  );
});
