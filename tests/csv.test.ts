import test from "node:test";
import assert from "node:assert/strict";
import { serializeCsv, csvFilename, csvTimestamp } from "../lib/csv";
import { freshWorkspace } from "../lib/store";
import {
  teamProgressRows,
  teamProgressCsv,
  courseProgressRow,
  courseProgressCsv,
  feedbackRows,
  feedbackCsv,
} from "../lib/reporting";

test("CSV preserves Unicode, delimiters, quotes, line breaks, missing values and headers on empty reports", () => {
  assert.equal(
    serializeCsv({
      headings: ["Name", "Comment", "Count", "Missing"],
      rows: [["Zoë 東京 🌲", 'comma, "quote"\r\nsecond line', 0, null]],
    }),
    '\uFEFF"Name","Comment","Count","Missing"\r\n"Zoë 東京 🌲","comma, ""quote""\r\nsecond line","0",""\r\n',
  );
  assert.equal(
    serializeCsv({ headings: ["Person"], rows: [] }),
    '\uFEFF"Person"\r\n',
  );
  assert.equal(
    serializeCsv({ headings: ["A", "B"], rows: [[undefined, false]] }),
    '\uFEFF"A","B"\r\n"","false"\r\n',
  );
  assert.throws(
    () => serializeCsv({ headings: ["A"], rows: [[1, 2]] }),
    /incomplete/,
  );
  assert.throws(
    () => serializeCsv({ headings: ["A"], rows: [[NaN]] }),
    /invalid/,
  );
});
test("CSV neutralizes formula prefixes, controls and full-width variants without modifying generated numbers", () => {
  for (const value of [
    "=1+2",
    "+cmd",
    "-1+2",
    "@SUM(A1)",
    "  =1+2",
    "\t=1",
    "\rhello",
    "\nhello",
    "\u0000=1",
    "＝1",
    "＋1",
    "－1",
    "＠foo",
    "\uFEFF=1",
  ]) {
    const csv = serializeCsv({ headings: ["User text"], rows: [[value]] });
    assert.ok(csv.includes("\"'" + value + '"'), JSON.stringify(value));
  }
  assert.ok(
    serializeCsv({
      headings: ["Number", "Text"],
      rows: [[-10, "12345678901234567890"]],
    }).includes('"-10","12345678901234567890"'),
  );
});
test("filenames and timestamps are descriptive, unambiguous and UTC", () => {
  assert.equal(
    csvFilename("Team Progress", new Date("2026-09-21T23:30:00-07:00")),
    "team-progress-2026-09-22.csv",
  );
  assert.equal(
    csvFilename("../Zoë / team:", new Date("2026-09-21Z")),
    "zoë-team-2026-09-21.csv",
  );
  assert.equal(
    csvTimestamp("2026-09-21T10:30:00-07:00"),
    "2026-09-21T17:30:00.000Z",
  );
  assert.equal(csvTimestamp(null), "");
  assert.throws(() => csvTimestamp("invalid"), /timestamp/);
});
test("team exports preserve filtered order, counts, percentage semantics and manager scope", () => {
  const data = freshWorkspace();
  const manager = data.users.find((u) => u.role === "manager")!;
  const admin = data.users.find((u) => u.role === "admin")!;
  data.teams!.push(
    { id: "child", name: "Subteam", parentId: "sales-team" },
    { id: "other", name: "Other" },
  );
  data.users[0].teamId = "child";
  data.users.push({
    ...data.users[0],
    id: "outsider",
    teamId: "other",
    name: "SECRET OUTSIDER",
  });
  const rows = teamProgressRows(data, manager, "sales-team", "alex");
  assert.deepEqual(
    rows.map((r) => r.u.id),
    ["demo-learner"],
  );
  const csv = teamProgressCsv(rows);
  assert.deepEqual(csv.rows[0], [
    rows[0].u.name,
    rows[0].u.email,
    "Subteam",
    rows[0].assigned.length,
    rows[0].completed,
    rows[0].percent,
    rows[0].status,
  ]);
  assert.equal(rows[0].percent, 25);
  assert.equal(teamProgressRows(data, manager, "other").length, 0);
  assert.equal(teamProgressRows(data, data.users[0]).length, 0);
  assert.ok(
    !serializeCsv(teamProgressCsv(teamProgressRows(data, manager))).includes(
      "SECRET OUTSIDER",
    ),
  );
  assert.ok(teamProgressRows(data, admin).some((r) => r.u.id === "outsider"));
  const large = structuredClone(data);
  large.users = Array.from({ length: 1507 }, (_, i) => ({
    ...data.users[0],
    id: `person-${i}`,
    name: `Person ${i}`,
  }));
  assert.equal(
    teamProgressCsv(teamProgressRows(large, manager)).rows.length,
    1507,
  );
  assert.equal(
    teamProgressCsv(teamProgressRows(large, manager)).rows.at(-1)![0],
    "Person 1506",
  );
});
test("course exports preserve current-version, deduplicated assignment and optional progress semantics", () => {
  const data = freshWorkspace(),
    user = data.users[0];
  const course = data.content.find((c) => c.id === "course-4")!;
  let row = courseProgressRow(data, user, course);
  assert.equal(row.done, true);
  assert.equal(row.status, "Complete");
  assert.equal(row.assignment, "Assigned");
  assert.equal(courseProgressCsv([row]).rows[0][9], "Complete");
  row = courseProgressRow(data, user, { ...course, version: 2 });
  assert.equal(row.done, false);
  assert.equal(row.lessons, 0);
  const optional = { ...course, id: "optional", groups: [], assignments: [] };
  data.content.push(optional);
  row = courseProgressRow(data, user, optional);
  assert.equal(row.assignment, "Optional");
  const before = teamProgressRows(
    data,
    data.users.find((u) => u.role === "admin")!,
  )[0];
  data.progress[user.id].push({
    content_id: optional.id,
    version: 1,
    lessons: [],
    passed: false,
  });
  const after = teamProgressRows(
    data,
    data.users.find((u) => u.role === "admin")!,
  )[0];
  assert.equal(after.percent, before.percent);
  assert.equal(
    courseProgressCsv([row], "team").headings.includes("Recorded lessons"),
    false,
  );
});
test("feedback export follows all filters, chronological sorting and readable fallbacks", () => {
  const data = freshWorkspace();
  data.feedback = [
    {
      id: "a",
      contentId: "course-1",
      userId: data.users[0].id,
      version: 1,
      rating: "up",
      comment: 'Zoë, "hello"\n東京',
      updatedAt: "2026-09-21T17:30:00Z",
    },
    {
      id: "b",
      contentId: "course-1",
      userId: data.users[0].id,
      version: 1,
      rating: "down",
      comment: "=1+2",
      updatedAt: "2026-09-20T17:30:00Z",
    },
    {
      id: "c",
      contentId: "removed",
      userId: "removed",
      version: 1,
      rating: "up",
      comment: "",
      updatedAt: "2026-09-19T17:30:00Z",
    },
  ];
  assert.deepEqual(
    feedbackRows(data, "all", "all", "all", "", "oldest").map((r) => r.id),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    feedbackRows(data, "course", "course-1", "up", "Zoë").map((r) => r.id),
    ["a"],
  );
  const report = feedbackCsv(feedbackRows(data));
  assert.equal(report.rows[0][6], "2026-09-21T17:30:00.000Z");
  assert.equal(report.rows[2][0], "Removed content");
  assert.equal(report.rows[2][3], "Former user");
  assert.ok(serializeCsv(report).includes('"\'=1+2"'));
  assert.equal(feedbackCsv(feedbackRows(data, "doc")).rows.length, 0);
});
