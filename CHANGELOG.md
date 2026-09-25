# Changelog

No versions have been released. Package and MCP version strings do not constitute a GitHub Release. See the [release process](docs/releases.md).

## Unreleased

- Keep the Administration menu heading visible while its section list scrolls independently, simplify guest sign-in and Courses home, move Docs/Updates category into article metadata, and add date and title sorting to learning-group content pickers.
- Keep course lessons and quizzes inside the shared reader route. Open a lesson with Next navigation, fetch only that course's signed-in progress, and save completion and quiz attempts through the existing server endpoint. Guest progress and explicit import after sign-in remain available without loading the full workspace.

- Open administration from a server-rendered route with a compact content index. Fetch people, reporting data and feedback only when their sections open, and load one full draft when editing. Administrator saves no longer reload the full workspace.

- Let visitors to public installations rate and comment on published Docs, Updates and Courses. Save guest feedback under a pseudonymous browser token and include it in administrator reports. Apply `20260924150351_anonymous_feedback.sql` before deploying this change to an existing installation.

- Keep Courses, Docs and Updates in one reader shell with a compact Courses catalog and current learner progress. Accept course progress submissions from either trusted Vercel preview address so guest lessons and quizzes work when opened from a deployment link.

- Reuse published Docs and Updates indexes and article bodies across reader requests, and expire them immediately after publishing or unpublishing through the web editor or administrator MCP. Installation access and personalized relevance remain request-time checks.

- Clear admin navigation warnings after confirmed settings and curriculum saves while retaining prompts for genuinely unsaved edits and blocking navigation during saves.

- Restore administrator learning-group saves on installations that require a WHERE clause for updates. Scope pending-account group cleanup to affected accounts, and show one concise error beside the group if a save fails. Apply `20260923230000_scope_pending_group_cleanup.sql` before using group administration on an upgraded installation.

- Replace the shared opening screen with a minimal, installation-neutral message and an indeterminate loading bar.

- Remove the unnecessary guest option from the demo profile picker; signed-out visitor recommendations remain available in public installations.

- Tighten built-in copy on learner, visitor and manager pages while keeping progress, safety and recovery information. Let the longer feedback prompt wrap beside its rating controls. Set the default footer tagline to "The Fieldbook | A Lightweight, Opinionated, Open-Source LMS".

- Use a shared searchable, creatable dropdown for categories, channels and Doc sections. New Docs and Updates start with an empty section/category prompt.

- Write Docs and Updates visually with formatting controls and a safe Markdown fallback. Separate draft saving from publication, keep saved work open, and organize settings into shared fieldsets. The demo now preserves a published copy while draft edits are saved.

- Keep publication badges compact and show unpublished draft changes as separate supporting text in the content table.

- Browse a searchable reporting hierarchy, create subteams or move existing branches with an explicit reporting-access review, and detach a branch to the top level. Delete only empty teams with no member, pending-account, child-team or learning-group references. Server deletion requires the guarded-team-deletion migration; memberships and saved progress are preserved.

- Manage teams in a full-width detail view with searchable, paginated rosters, direct/subteam membership and hierarchy navigation. Review multiple member additions and moves, remove direct members without deleting accounts, and edit team details in the shared dialog. Preserve progress, existing assignment rules and revision-checked administrator saves.

- Apply shared grey footers to administration collection cards and the team editor, align wrapping filters, and reveal admin tab and drill-in destinations with reduced-motion support. Feedback item views now clearly name their scope and clear conflicting filters.

- Make People settings guidance consistent in grey fieldset footers, and add shared two-choice feedback with a compact trigger, focused comment panel, pending/error recovery and a catalog example.

- Align the shared library with live Geist references: filled shadcn avatars, checkbox/switch/collapsible primitives, grey settings and dialog footers, underline tabs, quieter surfaces and compact status treatments.
- Refine Docs reading proportions and centered metadata; replace large disclosure markers with small chevrons while retaining navigation, outlines and saved tree state. Document reference mappings and owned-source component choices.

- Refine shared typography and control states across both apps, with connected form labels/help, consistent settings sections, accessible editor hints, progress rings, readable statuses and responsive administration navigation.
- Distinguish persistent notes, validation, activity and completion; show honest loading/empty states for AI connections and a shared Updates count/load-more footer. Extend the component catalog and contributor guidance.

- Show the two newest group-relevant Updates in For you, then list the remaining published library once with a local Load more control that reveals ten at a time.
- Keep the demo and production feed on the same group, publication and ordering rules; use published snapshot dates without allowing unpublished draft edits to reorder an Update.

- Keep the shared application bar visible while scrolling, with responsive search and document-heading offsets.

### Docs navigation

- Support two-level Docs sections in settings and a searchable full-path picker in the editor. Sections keep stable IDs through renames and moves; draft and published documents retain their placement. Reader navigation and previous/next links share the saved order. Existing flat sections remain top-level without a database migration.

- Give document sections and wrapping links a clearer hierarchy, with a separate tree scroll region and retained tab-local position.
- Add shared heading anchors, a responsive On this page outline and previous/next published-document links across sections.
- Balance the sidebar, reading column and outline while preserving server-rendered content, access checks and existing fonts.

### Reading pages

- Keep short and long Docs and Updates at the shared responsive reading width in both demo and production.

- Server-render published Docs, Updates and course overviews with item metadata and real missing-page responses. Private installations authorize content and metadata before rendering, using uncached request-time reads.
- Make breadcrumbs navigable, preserve lesson destinations and retain interactive learning, guest progress and editor guards.

### Contained search

- Highlight the search result container on hover instead of underlining its text; keep a visible keyboard focus ring.

- Search opens in a contained, scrollable panel with type filters and loading skeletons, preserving the current page and edits.

### Action confirmations

- Replace persistent save/publish banners with one shared confirmation that appears outside the page layout and fades after four seconds. Successive actions replace it instead of stacking. Use this across content, people, settings, groups, curricula, teams and assignments; keep errors and required next steps inline.
- Standardize alert content layout and distinguish draft saves from publication in confirmation copy.

### Guest recommendations

- Public installations can optionally select or explicitly create a learning group for signed-out For you in Updates and Courses. Reuse parent-group inheritance, curricula and deduplicated learning; keep guest progress local without people records or deadlines.
- Add equivalent synthetic demo behavior, safe empty/deleted-group/private-mode fallbacks and minimal anonymous data projection. Signing in uses account groups and preserves the existing explicit progress-import flow. No migration is required. See [guest recommendations](docs/guest-recommendations.md).

### Reporting exports

- Add Export CSV to organization/team progress, person assignments, course progress and optional history, and administrator feedback. Reuse the displayed filters, order and calculations with all matching rows and the existing server scope.
- Share UTF-8 CSV escaping, formula-text protection, UTC timestamps/filenames, header-only empty files and loading/failure handling across demo and production. No migration or new endpoint is required. See [reporting](docs/reporting.md).

### Published-content search

- Search published Updates, Docs and course lessons with ranked matches, excerpts, type filters and stable lesson links. Support prefixes and limited typo correction, keyboard navigation, mobile layouts and recoverable failures.
- Keep learner retrieval behind installation access checks, separate from administrator draft search; exclude quizzes and preserve published source revisions. Late responses cannot replace newer queries.
- Add migration `20260921205449_published_search.sql` for transactional PostgreSQL indexing. Apply it before deploying this application version; see [search setup and limitations](docs/search.md). No external search service is required.

### Branded account experience

- Limit sign-out to the explicit account action button; names and avatars are noninteractive. Explain profile switching beside the demo account and use a distinct switch icon.

- Use a shared circular initials avatar in demo profiles, sidebar accounts and article attribution, with a visible border and consistent sizing.

- Share the installation identity across the workspace, sign-in, consent, connections and simulated demo profile picker. Add an optional welcome description to existing organization branding settings; reuse the published privacy-policy link.
- Redirect signed-out private visitors directly to sign-in with their original destination preserved. Public browsing remains available. Missing sessions are expected; service failures and denied accounts retain distinct recovery messages.
- Make only the configured ready logo available before sign-in through a dedicated endpoint; keep content, other media and settings protected. Missing or failed images use the book mark.
- Preserve safe destinations through cancelled or failed authentication. No migration, new dependency or provider configuration change is required.

### Complete catalog and reporting reads

- Read all pages of published content, administrator drafts and authorized feedback, including installations with lower database response caps. Failed or detectably changing reads return an error instead of partial results.
- Authorize published article, lesson and cover media by querying the requested reference directly, so older content retains media access in larger libraries.
- Read all aggregate MCP reporting data and align current-version started/completed counts with learner course cards. Empty reset records no longer count as started; quiz attempts do.
- MCP reports now return `complete: true` instead of `recordLimit: 1000`. Reads are not a transactional snapshot of concurrent edits. No database migration or new dependency is required.

### Authoring safety and recovery

- Keep content edits open after failed saves, protect dirty edits during navigation, and block saving or leaving while inline images, videos or covers upload.
- Offer a draft download and explicit review of the latest saved copy. Distinguish revision conflicts, partial saves, uncertain network outcomes and confirmed saves whose refresh failed; do not automatically replay writes.
- Report handled server failures with a correlation ID and redacted structured diagnostics. Authentication outages are reported as unavailable rather than treated as signed-out visitors.
- No database migration or new dependency is required.

- Assigned curricula now replace their courses with one progress card and open a simple ordered course-launch page. Course return navigation preserves curriculum context.
- Shared learning cards, collection toolbars, header-owned scrolling controls and launch lists reduce layout drift; channel dropdowns replace repeated filter buttons.

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

### Interface redesign

- Shared neutral theme, Geist typography, consistent spacing, compact actions, and responsive layout across learner, manager, and administrator views.
- Grouped administration navigation and clearly separated settings sections.
- shadcn-style owned Radix components for dropdowns, tabs, menus, buttons, and accessible dialogs.
- Compact learning status, an accurate no-required-courses state, and expandable group-specific learning.
- Preserved existing feature handlers; no database or permission changes.

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
