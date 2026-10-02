# Reporting and CSV exports

Administrators can export Progress, Feedback and the assigned-course and course-detail reports reached from **People → Courses & progress**. Managers can export **Team progress** and a person's **View courses** details within their reporting scope. Open the report, set its filters and sort order, then choose **Export CSV** in its header. The browser downloads the file; Fieldbook does not upload or retain it.

Exports include every matching row in the displayed order, including rows outside the visible viewport. The current reports have no display pagination. Exporting an empty result produces a file containing the same column headings. Team/group/course configuration lists and the learner's course browser are not reporting exports. The demo uses the same controls with browser-local synthetic data; it does not enforce real identity.

## Columns and meaning

| Report | Exported columns |
| --- | --- |
| Progress / Team progress | Person, email, reporting team, assigned courses, completed courses, completion (%), learning status |
| Person's View courses | Person, email, reporting team, course, category, published version, assignment, target date, status |
| Assigned courses | Learning group (when group-scoped), person/email (when person-scoped), course, published version, assigned through, completed people, total people |
| Course progress detail / optional history | Person, email, reporting team, course, category, published version, assigned/optional, target date, status, progress, recorded lessons, total lessons |
| Feedback | Content, content type, content version, person, rating, comment, updated at (UTC) |

Headers are fixed and fields are explicitly selected. Exports do not contain internal IDs, account settings, quiz answers or raw progress attempts. Feedback includes the author's displayed name, without adding their email. Missing people/content use the same “Former user” / “Removed content” labels as the screen. Missing values are empty cells; no assignments means an empty percentage, not zero percent completion.

Assignment completion uses the latest published course version, the same lesson/check requirements and the same capped rounding as the screen. Overlapping team/group/curriculum assignments count once. Optional history does not reduce assigned completion. Course detail retains the screen's recorded-lesson count, which can include historical lesson IDs; it is not a new completion calculation. Group-scoped assignment details retain their existing membership rules, including inactive members; Progress includes active people only. See the [learning model](learning-model.md) and [permissions](permissions.md).

Target dates are calendar dates in `YYYY-MM-DD`. Feedback timestamps are ISO 8601 UTC, such as `2026-09-21T17:30:00.000Z`. Filename dates also use UTC, so they can differ from your local date near midnight. Names identify the report and, for detail reports, its person/group/course: `team-progress-2026-09-21.csv`, `feedback-2026-09-21.csv`, or `alex-example-assignments-2026-09-21.csv`.

## Completeness, access and failures

CSV uses the complete workspace already loaded for the screen. It does not make a privileged export request or widen scope. The server scopes people/progress before returning them, and manager-only accounts receive only their own feedback. Contributors and administrators can export the full content/general feedback view; contributor team reporting remains scoped to explicitly managed teams. A manager's team membership alone grants no reporting permission. Exporting does not refresh the report automatically: reload it to pick up changes from other sessions. Already delivered browser data cannot be recalled after a later permission change.

Catalog and feedback reads page past the database API's configured row cap; the governance response returns its authorized people/progress arrays as one JSON result. A failed page, missing count or changed total fails the load instead of returning partial results. Initial loading/failure screens cannot export. Pending updates and failed changes block exports until a successful reload/change supplies complete data again. A CSV preparation failure displays an error and creates no download; retry or reload. The UI does not claim that a file was saved successfully, since the browser controls the final save.

There is no export row limit. The workspace and CSV must fit in browser/server memory. Multiple underlying page requests are not one transactional snapshot: simultaneous edits can produce mixed-time values even when counts remain stable. For a point-in-time operational record, export during a quiet period and retain the file. No additional service, export endpoint, migration or configuration is required.

## MCP reports

An approved AI connection can use `get_reporting_scopes` and `learning_report` with the `reports:read` capability. Administrators can report across the installation. Managers and contributors with explicit team-management responsibilities can report only on active people in their managed teams and descendants. The database scopes people before joining progress or assignments. The actor's own account is included only if it falls within that reporting scope. Active preregistered people can appear in a report; an actor must have completed sign-in before using MCP.

`get_reporting_scopes` returns available team IDs/names, learning-group IDs/names and published course IDs/titles/versions. It excludes member lists, team managers, group-to-team links and course bodies/answer keys. Group discovery for a manager includes only groups containing people in that manager's reporting scope.

`learning_report` accepts these filters:

| Input | Meaning |
| --- | --- |
| `teamIds` | Selected reporting branches, including descendants; every selected team must be authorized. |
| `groupIds` | People in any selected learning group, intersected with the authorized reporting branches. A shared group never exposes another team's people. |
| `courseIds` | Selected currently published courses. |
| `assignment` | `assigned` by default; `optional` for current-version optional activity; `all` for both. Untouched optional courses are excluded. |
| `status` | `all` by default, or `not_started`, `in_progress`, `complete`, `overdue`. Completed learning is never overdue. |
| `limit`, `cursor` | Up to 100 rows per page, default 50; use the returned cursor for subsequent pages. Each ID filter accepts up to 100 IDs. |

Each row identifies the person by stable ID and display name, their reporting team and learning groups, and the course/current published version. It includes assigned versus optional status, saved assignment episode/start/deadline, current due date, assignment sources, completion/activity, recorded current lesson completion and total lessons. It excludes emails, authentication identifiers, raw attempts and quiz answers. An inherited Team assignment rooted outside a manager's reporting branches uses the label “Inherited team assignment” without revealing that team's ID/name. Overlapping sources yield one person/course row.

Saved assignment deadlines stay attached to the current course/version episode. When due dates are paused, the current `dueDate` is null and `overdue` is false; `savedDueDate` remains available. Completion uses the same published-version and lesson/check rules as the application. Optional completion is counted separately and never lowers assigned completion.

The response contains a bounded `rows` page, `returnedCount`, the exact filtered `total`, assigned/optional `totals` covering all matching pages, `hasMore`, `nextCursor` and `complete`. To export a whole report, collect pages until `complete` is true and `nextCursor` is null. Keep the same filters; page size may change. Cursors are bound to the actor and filters, and the database repeats current authorization on every page. Changes to matching report data, reporting governance or the UTC reporting date invalidate the cursor and require starting again; Fieldbook does not silently combine incompatible pages. The database API's ordinary row cap does not truncate report totals or page traversal.

Publishers can separately use `feedback_report` with approved `feedback:read`. Filters include content kind (`doc`, `brief`, `course`, `general`, or `all`), content ID and rating (`up`, `down`, or `all`). It returns paged content/general feedback with displayed respondent names, content versions, ratings, comments and timestamps, without adding email, guest identifiers or progress. Managers without publishing access cannot use this report. Feedback pagination uses the same bounded-page, completeness and changed-data rules.

These tools return structured export pages; they do not download a CSV or send a report to another person. The browser CSV controls above remain available. The original `content_report` remains an administrator-only aggregate report with its separate `reports:aggregate` capability. It does not grant access to individual learner rows. See [MCP connection setup](mcp-setup.md) for consent and upgrades, and apply all migrations, including `20261002222355_mcp_scoped_reports.sql`, before deploying the matching server.

## Spreadsheet compatibility

Files use UTF-8 with a byte-order mark, comma delimiters, quoted cells, doubled embedded quotes, preserved line breaks and CRLF record separators. These conventions support Excel and Google Sheets. If your spreadsheet's locale does not detect commas, import the file explicitly as UTF-8/comma-separated CSV. Import date-like text as text when you need to preserve its exact formatting; CSV cannot enforce spreadsheet cell types.

User-controlled text beginning with a formula prefix (`=`, `+`, `-`, `@`, including full-width variants and leading whitespace/control characters), or a leading tab/newline, receives an apostrophe prefix. This prevents formula interpretation on import, though some applications display the apostrophe. Do not remove those prefixes from untrusted data. Numeric application calculations remain numbers. This protection does not control what another application does if the file is edited and saved again.

## Contributor verification

Run `pnpm test`, both builds, `pnpm check:ui`, `pnpm test:ui`, and `pnpm test:reporting`. Build the server application using the synthetic environment variables in [CONTRIBUTING](../CONTRIBUTING.md). Reporting browser tests download and parse actual files from demo and production UI fixtures on desktop and phone, including 1,205 filtered people, Unicode/multiline/formula text, empty results, failure recovery, keyboard access and screenshots. Production read tests exercise a capped synthetic HTTP API; governance tests exercise permissions in embedded PostgreSQL. These are local/simulated checks, not hosted Auth/PostgREST verification or tests performed inside Excel or Google Sheets. Inspect screenshots and representative CSVs separately. Run browser suites sequentially because their output folders are nested.

MCP reporting tests apply the real reporting migration to synthetic embedded PostgreSQL and call it through the server's provider adapter. They cover sibling/group isolation, explicit contributor management, role revocation, current-version completion, paused saved deadlines, safe feedback/discovery projections and changed/mismatched cursors. Pagination checks traverse more than 1,000 rows without duplication and aggregate a 500-person, 100-course installation while returning only the requested page. Provider adapters must preserve these authorization, projection and completeness guarantees.

Assigned-through labels list every matching team and group source. A shared course counts once per person even when several audiences assign it; manager reporting authority remains independent of assignment-team membership.
