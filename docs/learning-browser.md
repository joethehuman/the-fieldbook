# Learning browser and progress indicators

The Courses home keeps the assigned-only completion summary and unfinished assigned queue. The full browser has four views: For you, In progress, Completed, and All courses. For you includes completed assignments by default; Hide completed removes them without changing channel grouping or recommended ordering. In progress and Completed include optional courses as well as assignments.

The same saved current-version progress drives every card. Valid lesson activity or a quiz attempt starts a course; opening it alone does not. Lessons plus a passed knowledge check fill the course ring. A curriculum ring counts completed courses, and empty playlists do not earn a completion check. Only group assignments affect the overall percentage, deduplicated through the existing learning model.

## Shared UI

- `ProgressStatus` owns compact ring/check presentation and accessible text.
- `CourseRow` owns resize/list/scroll observation and endpoint controls.
- `ContentAction` offers an inside-focus-ring variant for clipped scrolling containers.
- `SplitPanel` supports equal-height summary/course compositions.
- Existing FilterOptions, Field, Checkbox, CardFooter and theme tokens remain the control system. The demo `/ui` catalog includes the new shared patterns.

The home queue always follows the saved recommendation. Browser sorting affects its collection only. No assignment, completion-write, authorization, schema or content mutation was added.

## Verification

Locally verified using Node 22.23.2 and the repository's existing pnpm 10.17.1 dependency installation:

- 36 shared behavior tests and 10 server tests passed.
- Demo and server builds passed; both TypeScript checks passed.
- UI ownership check passed.
- All 45 browser tests passed in installed Chrome across desktop, tablet and phone, including 200% text, filter keyboard operation, optional activity at 100% assigned completion, completion followed by reload, curriculum indicators, card height alignment, and scrolling endpoints/resize.
- Reviewed screenshots of the home row, For you cards, phone layout and enlarged-text layout. Browser tests exercise synthetic, browser-local demo data. Hosted Google sign-in and authenticated Supabase persistence were not exercised by this change.

Set `FIELDBOOK_TEST_PORT` to isolate this checkout's browser test server from another running demo (default remains 3117).
