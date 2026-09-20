# Changelog

No versions have been released. Package and MCP version strings do not constitute a GitHub Release. See the [release process](docs/releases.md).

## Unreleased

- Unify course browsing into For you, In progress, Completed and All courses, with a default-off Hide completed control for assignments and channel grouping throughout.
- Add compact course/curriculum progress rings and completion checks while keeping overall progress assigned-only. Simplify the learning summary, align its desktop card with the course row, and hide unnecessary scrolling controls.


### Shared design system

- Tighten shared composition rules: aligned navigation and reorder actions, stacked heading descriptions, separated filter/create actions, predictable account identity, inline card arrows and spaced feedback confirmation actions. Declare stable column schemas for every application table so filtering cannot redistribute columns. Extend the catalog and visual checks to tablet widths and changing result sets.

- Apply one token-based shadcn/Radix and Tailwind component system across learner, manager, administrator, editor, and server account pages. Replace raw feature controls and unify forms, tables, actions, navigation, feedback, and page structure.
- Replace native group/curriculum dropdowns with shared Select controls and use keyboard-accessible group tabs. Reuse one course-sequencing pattern and keep admin navigation compact on narrow screens.
- Delete the overlapping redesign override sheet and retire the old global control styling. Keep scoped layout, prose and decorative artwork with explicit ownership.
- Add a demo component catalog at `/ui`, automated component/styling rules, desktop/phone browser checks and screenshot reports. Document mandatory component reuse in AGENTS.md and contributor guidance.
- Add Tailwind/PostCSS build dependencies and Playwright development checks. This UI overhaul adds no database migration; the underlying learning-groups changes retain their separate upgrade requirement.

### Learning groups and curricula

- Consolidate Groups and Required courses into Learning groups, with people/team membership, searchable course and curriculum selection, recommended sequencing, and Update targeting.
- Add a separate Curricula builder and browsable published course playlists. Linked playlist edits update group learning lists while preserving valid completions and continuous assignment dates.
- Show personalized Updates first, then other updates, without hiding content or counting updates toward learning completion. Standardize course organization as Channel.
- Use assigned-learning and completion language, reserve 100% for full completion, and keep recognition/enforcement outside the platform.
- Requires new migration `202609200004_learning_groups.sql` and matching code during a coordinated upgrade. See [upgrade and verification details](docs/learning-groups.md). No new environment variables or dependencies.

- Restore the learning completion summary as a left-hand card with a prominent progress ring beside the For you courses. Stack the card above courses on smaller screens.

- Replace the demo sign-in slogan with straightforward Fieldbook copy and update its browser title.

- The browser-local demo offers three sign-in personas: Account Executive, Sales Director, and Organization Admin. The manager's team has five sample reps with varied course completion. Existing browser-local demo data is unchanged until the demo is reset.

- Docs now use a shared Section dropdown with inline section creation. Navigation settings retain empty sections and support drag, touch, and keyboard reordering. Empty sections remain hidden from readers. Existing folder data is preserved; no new migration is required.

- Keep the browser-progress import banner clear of the desktop sidebar and allow its controls to wrap on narrow screens.

- Give sign-in a compact, responsive layout with separated secondary links. Keep return destinations in a short-lived cookie so the sign-in address stays clean.

### Required-learning verification

- Updated stale assignment tests and learning documentation to the current group-only requirements and organization onboarding/catch-up windows.
- Database assignment checks now include the required-learning migration, rejection of individual assignments/custom deadlines, and preservation of audited individual progress actions.
- Full test suite passes; no application behavior or database schema changes in this follow-up.

### Content navigation and course covers

- Admins can save the Docs section order under Organization Settings → Docs navigation. The sidebar and overview use the same order; new sections append alphabetically.
- Courses can use an uploaded cover image or retain generated artwork. Covers support replacement and removal, preserve draft/publication behavior, and use existing private media storage.
- Update cards align artwork at the top, omit list-position numbers, and cycle through the existing background palette.
- No database migration is required. See [content presentation controls](docs/content-presentation.md).

### Interface redesign (review branch)

- Shared neutral theme, Geist typography, consistent spacing, compact actions, and responsive layout across learner, manager, and administrator views.
- Grouped administration navigation and clearly separated settings sections.
- shadcn-style owned Radix components for dropdowns, tabs, menus, buttons, and accessible dialogs.
- Compact learning status, an accurate no-required-courses state, and expandable group-specific learning.
- Preserved existing feature handlers; no database or permission changes. See [review scope and verification limits](docs/ui-redesign.md).

### Current implementation

- Separate browser-local demo and server application sharing a Next.js interface.
- Production content editing/publication, Google sign-in, learner progress, feedback, media uploads, and instance settings on Vercel and Supabase.
- Administrator-authorized MCP content tools, aggregate reports, and media lookup; ChatGPT exercised end to end.

### Repository foundation

- Documented the supported Vercel + hosted Supabase setup and its limits.
- Added explicit release selection, operator-controlled upgrades, migration handling, and a manual maintainer release process.
- Removed the obsolete DigitalOcean deployment manifest and setup instructions.

### Known boundaries

- Groups, teams, people administration, and manager reporting remain demo-only.
- Search/reporting are bounded, navigation labels are fixed, and uploaded video is not transcoded.
- Fresh-install rehearsal, remaining live integration checks, license selection, and private security reporting are release gates, not completed claims.
