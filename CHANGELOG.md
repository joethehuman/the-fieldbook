# Changelog

No versions have been released. Package and MCP version strings do not constitute a GitHub Release. See the [release process](docs/releases.md).

## Unreleased

- Replace the editor’s permanent Draft recovery section with a confirmed Revert to published version action at the bottom of Details. Group quiet save and unpublished-edit text beside the publication pill and a consistent Publish action in one header line, with deliberate compact labels instead of clipped text on phones. Failed saves retain open work and offer a primary revision-checked retry plus quiet saved-draft reload and download actions without changing live content or learner progress.
- Share Admin Progress and manager Team progress with a people-up-to-date ring, learning-status chart and drillable subteam comparisons. Include active preregistered people, separate onboarding from overdue status, preserve filters/page/scroll through person details and export the same matching rows across pages. Read authorized person totals without course bodies or attempts; recheck access and report values before CSV downloads. Apply `20261002232135_progress_report.sql` before deploying the matching server code.

- Define the portable MCP contract with checked input/output schemas and provider ports. Add role-aware, explicitly approved tools for rich Docs/Updates/Courses, verified image/video transfers, complete catalog/media pagination, named scoped learning reports, feedback and administrator course assignments. Preserve the endpoint and original eight-tool admin grants; added permissions require approval on the same connection. Learners have no access, contributors are trusted publishers and managers report only on explicitly managed teams. Unsupported operations explain their manual destination. Apply `20261002222314_mcp_catalog.sql`, `20261002222344_mcp_connection_capabilities.sql` and `20261002222355_mcp_scoped_reports.sql` before deploying; see the MCP upgrade guide.

- Make Organization visible on Teams. People without a named team automatically appear there for membership, reporting and Organization-linked learning groups; moving or removing a team membership keeps saved learning history and deadlines. Guests use the configured guest learning group and stay outside the reporting hierarchy. Existing installations require `20261002184642_organization_membership.sql` after the built-in Organization migration.

- Browse reporting teams in compact connected columns that scroll horizontally through every depth, following one branch with explicit Open/Edit actions. New teams return to their parent list. Organization is a built-in reporting root with a manager and direct-member page; upgrading preserves existing team IDs, members and saved learning. Assignment pickers use full-content relevance search with highlighted excerpts, independent category/type filters and pagination in a stable-size dialog. Learning-group People adds shared filters, sorting and reviewed bulk removal of direct memberships.

- Search parent-team names and ancestry, with compact paths and an accessible full hierarchy. Teams use smaller icon/count cards with toggleable branches and persistent controls above independently scrolling chart columns. Omit the conditional chart breadcrumb so opening a branch does not shift its layout, and discard old connector lines when switching branches. Learning-group creation returns to its index, with shared sorting, filters and one reviewed bulk deletion.

- Make learning groups independent overlapping audiences with a searchable index and focused People, Assigned Courses and Assigned Updates views. Teams retain their reporting hierarchy in a compact tree/detail workspace with one source-aware people roster. Search and primary assignment/member actions share a row; parent-team menus remain anchored inside dialogs. Assign learning from a group or from existing Content/Curricula controls, using one contextual consequence review. The flat-group upgrade preserves current memberships, learning, deadlines, history and guest relevance while ending future parent-group propagation.

- Save one continuous course-version assignment and deadline per person across overlapping sources. Team links include subteams, with explicit impact review for older direct-only links and organizational changes. Timing defaults affect future work; administrators can review and recalculate existing clocks and unfinished deadlines. Requires the stable-assignment migration.
- Assign published courses and curricula directly to teams or learning groups from one picker. Show all assignment sources and preserve saved deadlines across overlapping coverage. Requires the assignment-episode and team/group migrations.

- Remove the fixed 50 MB application/card-art upload ceiling while respecting optional operator and storage limits. Show upload progress, use signed chunked transfers with bounded retries for large files, and explain signing, storage and verification failures without losing draft text or inserting failed media. Existing storage limits require separate operator configuration.

- Add contributor accounts with the shared publishing panel, content/feedback editors and exports, authoring uploads, and content recovery. Explicit team management adds scoped reports; administrator accounts retain one organization destination. Course assignments, Docs hierarchy changes and people recovery remain administrator-only. Requires the contributor permissions migration; MCP connections remain administrator-only in this change.

- Lighten shared interface typography with regular navigation, labels and controls, medium headings and restrained emphasis while preserving authored bold. Make authored-table grids clearer in visual writing, draft previews and reading without changing table tools or local scrolling.

- Let short course lessons and the details card use their natural content height, keep the desktop course panel aligned across lesson/quiz changes, and preserve enough independently scrolling outline space for three lessons plus a quiz on short screens. Restore Previous lesson navigation without changing saved completion, including returning from quiz/finish screens. Place the main scrollbar at the workspace edge while keeping content centered, and use lighter, thinner shared scrollbars. Expand lesson images into a screen-fitting viewer with a visible Close button, Escape/outside dismissal and focus return.

- Preregistered people now appear in the normal roster and can be team members or managers before signing in. Verified first sign-in attaches their login without resetting their stable ID or history. Hire dates start onboarding, with an applied window and automatic New/Existing stage separate from login status. Apply `20261001222227_roster_people.sql` in a coordinated code/database upgrade; see the roster upgrade guidance.

- Editor web links accept bare domains such as example.com, formatting tools retain the active editor ring, link popups follow their text, command highlights respond immediately to mouse and keyboard, and Outline/Details panels slide open and closed with reduced-motion support.

- Add Organization Settings → External links for up to three ordered account-menu links. Share them with all signed-in users and public guests, with external-link arrows and new-tab destinations. Keep standalone account pages unchanged; no new migration is required.
- Administration acknowledges section changes immediately, keeps People and Teams reads independent of course history, and loads a selected person's progress on demand. Recently deleted housekeeping no longer delays other sections. Apply the additive `admin_people_reads` migration before deploying this version.


- License Fieldbook under the Elastic License 2.0 (ELv2), add license metadata to both application packages, and describe the project as source available under ELv2. Preserve third-party licenses; the repository remains private and no release is published.

- Add official Vercel Web Analytics and Speed Insights to the installed app and optional demo. Enable their normal SDK behavior on Vercel, with independent opt-outs, and keep them inactive on other hosts. Document project activation and the telemetry boundary for contributors.

- Put current hosting, identity, persistence and private-media operations behind explicit service boundaries. Preserve the Vercel/Supabase/Google installation and existing data/permissions, and document how contributors can add a verified hosting recipe or service implementation. Add standard Node host configuration and provider-boundary checks; complete alternate-stack recipes remain contributor work, and existing-installation transfer is separate.

- Make Manage organization and the Administration breadcrumb return Admin sections and editors to Content, and My team’s progress and the Team progress breadcrumb return member details to the manager overview. Selecting an already open landing screen closes the account menu without starting navigation. Preserve unsaved-work Cancel/Confirm and guard privacy-policy navigation from editors.

- Hide header progress during navigation within Docs, Updates and Courses (including curricula), retaining it for entry into Administration and other existing shell transitions. The progress segment slides in from the header’s left edge before its existing fixed-width bounce; triggering and navigation timing are unchanged. Replace the demo’s full-screen startup loader with its complete default profile-selection page, including Hoolibook identity and all three profile rows before browser storage loads. Selection becomes available after storage loads; saved profiles and storage-error recovery remain intact. Keep the demo’s preloaded Geist font from swapping in after first paint, avoiding a change in text wrapping and account-card height.

- Remove the desktop sidebar keyboard shortcut and hover tip while retaining the accessible toggle button.

- Handle command-menu Escape dismissal from the canvas or menu, preserving slash text and returning focus. Handle empty/root selections safely and add normal horizontal padding to Outline and Details buttons.

- Smoothly reveal publication requirements within their owning scroll area, with field context and sticky-header clearance. Long course outlines reveal the selected lesson without taking field focus.

- Use shared underline tabs for Write, Markdown and Preview draft in the editor toolbar.

- Remove hover tooltips from selected-text formatting icons and Commands while retaining their accessible labels.

- Keep the blank visual editor at the same height and its muted hint at the first line when focus moves in or out. Use one rounded focus frame around the toolbar and canvas across writing views. Stop that frame beneath the lesson controls, then scroll its responsive body while Write content keeps growing automatically. Retain native page/body scroll handoff, top-only fades and independent Details/Outline scrolling. Preserve Markdown recovery focus after a failed Write retry.

- Simplify the shared visual toolbar to Undo, Redo and Commands, sticky beneath the editor heading beside the view controls. Use Normal Text and Heading 1–4 in the block/slash menu; show a separate selected-text formatting panel with block styles, Bold, Italic, Link and Inline code. Preserve selected text while applying commands, reject stale targets and avoid changing adjacent list items when returning to Normal Text. Remove retired toolbar controls/state/styles and keep the blank-line caret before its placeholder hint.

- Limit the writing text width with both editor panels closed, with extra side padding when the app sidebar is also collapsed, while keeping the toolbar full width, and center the lesson-title field with balanced space beside Outline and Details, using smaller type than the course title. Focus the artwork Short title input directly from its publishing requirement.

- Keep editor save text before the publication pill so the pill stays beside Publish. Add conditional top/bottom scroll fades to Outline and Details, with a top-only fade where writing content passes beneath the sticky controls.

- Lift the lesson title into the Outline/Details row and use a muted Untitled lesson placeholder for new lessons. Put Write, Markdown and Preview draft in the shared gray toolbar; remove visible content labels and repeated slash hints. Keep view switching available during visual-editor loading and preserve its focus across mode changes.

- Use shared compact Filters and Sort controls, active filter chips, accurate empty/search counts and decorative separators between table text actions across administration. Content defaults to newest created first; Teams precedes Learning groups and Recently deleted comes last. Feedback uses content-type tabs with rating in Filters. Keep person details inside the admin frame and guard unsaved profile dismissal.
- Automatically save edited Docs, Updates and Courses drafts with visible save status and revision recovery. Publish remains explicit; its button shows Publish changes for edited live content and disabled Published when work matches the live copy. Incomplete work can remain a draft without weakening publication validation; no database migration is required.
- Use one shared editor frame with persistent Outline and Details toggles and inline panels at every width. Courses start with Outline open; keep lesson structure controls inline beside the selected lesson and remove the extra lesson card. Preserve a visible writing surface when switching; scroll back before replacing a scrolled lesson and retain a stable short-lesson canvas, with reduced-motion support. New courses start with an unselected category. Details owns the short description, metadata, a publishing checklist and draft recovery; Outline shows the current lesson position beside its toggle. Keep Back to content, save status and Publish in a compact header; show required counts only on Details. Remove the workspace hairlines, remove the editor viewport’s top inset and align the sticky bars without a gap, round title focus, give content/lesson titles the same preferred width, align editor controls with the left content edge, and let the writing canvas fill the space between panels. Remove the duplicate outline controls, editor drawers and header overflow menu. Align outer admin settings cards with the frame while retaining readable inner form widths.
- Unify administration page headings, deep navigation, quieter filters and tables, and visible team/curriculum actions. Align content editor headers, saved/publication state and responsive settings; give course lessons a wider writing canvas.
- Refine the shared writing toolbar and Commands menu; keep keyboard-selected commands visible, prevent inline slashes opening block insertion, and preserve pending slash text when Escape, Tab, pointer dismissal or scrolling closes the menu. Handle command Enter without inserting an extra paragraph or resetting the caret after typing begins.
- Remove legacy course opening-video URL and upload controls. Add new lesson videos through the inline writing editor.

- Retain one installed workspace shell across reading, Team and Administration, with shared demo frame geometry and unsaved-form navigation protection.

- The installed application now lives at the repository root; the optional browser-local demo lives in `demo/`. Default commands run the installed app, with explicit demo commands and deployment app-identity checks. Existing installations must coordinate their Vercel root settings with this source change.


- Keep Hoolibook's Security Basics course assigned after demo progress saves, and repair affected browser-local sessions without clearing completed lessons or quizzes.

- Replace the browser-local demo's sample catalog with Hoolibook: 12 courses with three lessons and checks, 15 Docs in five ordered sections, and 10 Updates. Fresh or reset demo workspaces receive the new catalog; existing saved browser workspaces retain their content.

- Align the course details and lesson headings in the player, move Exit course beneath the outline, and keep long outlines scrolling between fixed details and exit. Show lessons, quizzes and the finish view without an outer card border, hide the redundant guest notice and legacy course body text, and show the short description once. On narrow screens, navigation brings the lesson cleanly below the app bar; the course disclosure uses plus/minus controls, with more room around the outline, lesson navigation divider, and compact duration metadata. Match the lesson title to the course title size, step authored headings down beneath it, and remove the extra margin before an opening lesson heading.

- Keep Bulk actions and result-range labels in place as selection changes. Show selected counts after persistent range text and put Clear selection before the anchored menu across tables and pickers.

- Show Docs sections, learning groups and teams as expandable hierarchies. Move branches with destination and effect review, show membership sources and full paths, and keep Docs reordering consistent with its drag preview. Create learning groups in a dialog; place Teams and Curricula creation beside their search fields. Use visible type filters for Content, Feedback and Recently deleted; keep search visible and group related filter fields inside named Filters controls. Use filled, plus-marked Add and Create actions across administration. Simplify Docs section actions and make branch drops explicit. Shared selection rows center checkboxes and radios, show page/all-result scope, and keep Select all and Bulk actions fixed while selection counts and Clear selection appear. Docs changes still need Save settings.

- Start Docs sidebar subsections closed and show their labels at regular weight, using only the chevron to identify expandable rows.

- Rename Assignment window to Due dates and let administrators turn course due dates off while retaining the saved windows. Learners then see recommended language on Courses, with no due or overdue targets; group-selected progress remains intact.

- Let desktop readers collapse the shared sidebar to an aligned icon rail with a toggle. The navigation reveals without reflowing and keeps its open or closed state across pages; opening a course collapses it, while choosing Docs reopens its navigation.

- Add shared generated card artwork for Updates, Courses and Curricula, with 30 compositions, random Shuffle choices that avoid recent repeats, custom images, and Identity palette controls. Previously saved artwork keeps its original design. [Artwork guide](docs/card-artwork.md).

- Let administrators choose Updates, Courses or Docs as the installation home under Identity. Existing installations default to Courses; Docs continues to show the first published article in its saved order.

- Hide bulk selection controls for empty and single-item admin collections, retaining ordinary item actions and Add controls.

- Standardized contextual bulk actions and multi-select Add pickers across content, people, teams, learning groups and curricula, with existing-category choices, pending-account batches, connection revocation and searchable recovery.


- Add contextual bulk content, people, team and learning-group actions, multi-item learning pickers, and 30-day recoverable deletion. Recently deleted supports restoration; an authenticated hourly cleanup worker erases expired records and associated learning history. Requires the recovery and scheduler migrations and endpoint configuration described in [bulk actions](docs/bulk-actions.md).

- Show the Courses progress card beside For you courses on iPad-sized screens with enough room; keep the phone layout stacked and the Docs outline behavior unchanged.

- Remove the displayed author from Docs and Updates articles, and separate Doc parent and subsection names with a slash in article metadata.

- Keep the Docs On this page outline closed on narrow screens and visible on wide screens from the first render, without a resize-driven flash.

- Apply the saved installation accent to links, selected Docs and feedback, focus highlights and account pages; keep link text readable for light accent colors.

- Open Docs directly on the first published article in the saved order, prefetch neighboring Docs while reading, and highlight the selected Doc with a layout-stable accent color.

- Call course and content organization Category throughout administration, course browsing and the UI catalog. Existing saved categories remain unchanged.

- Warm the administrator or team destination when its account-menu action is opened, and warm reader destinations on administrator navigation intent. Show a slim, layout-stable header indicator after confirmed navigation; keep Team progress inside the reader shell while its report loads.

- Show one quiz question per course step, then a scored results screen with review, retry and optional feedback. An eligible final quiz submission or the last lesson of a no-quiz course now records completion before the shared finish screen; Close course only navigates away.

- Remove the workspace footer and tagline control. Find the published privacy policy and demo information in the account menu; account pages retain their privacy link.
- Keep standalone account pages in their own scroll area so a pull gesture cannot leave the demo profile chooser or installed sign-in card clipped on mobile.

- Simplify the shared Docs, Updates and Courses writing toolbar. Keep common formatting and Undo/Redo visible, add a touch-friendly Insert menu for blocks and media, and show brief desktop and mobile guidance below the controls. Give the Insert menus full-row choices, an inline slash search hint, and a fade when more options can be scrolled into view.

- Move account, team and organization actions into a shared profile menu for learners, managers, administrators and guests. Add general Fieldbook feedback through a dismissible dialog and include it in administrator feedback reports. Keep demo profile switching separate. Existing installations need `20260926182840_general_feedback.sql` before this feedback action can save.

- Open course cards directly in a responsive lesson player, with curriculum-aware return navigation, a sticky course outline, image expansion, a larger video view, and a final feedback and Complete course action. Curriculum cards open an ordered course-card page.
- Build courses one lesson at a time in the shared visual editor. Add a slash insert menu, inline uploaded or linked video, accessible image descriptions, and one optional final quiz. Quiz questions support two to five answers and one to four correct choices; an optional all-correct rule controls when completion unlocks. Save detailed attempts separately from course completion.
- Place course title and description above its settings, anchor the visual editor's searchable slash menu to the active line, and give lesson continuation the same quiet destination navigation as Docs. Reveal the complete lesson or quiz card when advancing.
- Add a 3×3 Table to the course editor's slash menu, let unmatched searches return to normal writing, and remove the extra blank line left by list insertion. Keep table controls compact and close an open row or column menu when its table scrolls.

- Make the Courses summary useful without assignments: show current course activity and link to a combined Your courses view, with an Assigned filter and a quiet marker on assigned cards. Keep the progress ring assigned-only and improve its spacing.

- Open Docs on the first published document in sidebar order, with a simple empty page when no Docs are published. Remove the back-to-Docs link from articles, keep the wide page outline visible, and place the mobile outline chevron beside its label.

- Refine the empty Courses summary, center reader feedback, align Docs navigation, unify card and account hover states, and show scroll cues in long Docs/Admin menus. The account icon gains a subtle filled hover and the guest sign-in button keeps its dark, readable hover. The course completion card fills the row when cards wrap below it, and course strips scroll directly without carousel arrows. Previous and Next Docs links sit at opposite reading-content edges. Docs top-level sections are fixed headings with tighter link spacing; subsections begin closed, reveal the selected page, and remember their open state. The narrow-screen menu stays open when Docs is selected and closes when a document is chosen. Course and Docs section ordering now moves full rows during drag while retaining reorder arrow controls. Authored course hyperlinks open in a new tab; Docs and Updates keep same-installation hyperlinks in place and open outside sites separately.

- Send the installation root directly to Courses and open Team progress in the shared reader shell with scoped reporting data. Use canonical `/docs` and `/updates` routes in place of the pre-release Knowledge/Notes aliases, and preserve the unsaved Admin editor prompt on browser Back. Warm Admin report sections after the Content view paints, without a visible status line shifting its navigation.

- Open a new demo session on the profile chooser, remove the redundant top-bar demo button, and keep “About this demo” in the footer at the surrounding text size.
- Center the shared opening message and loading bar. Show the hosted privacy policy in the app shell and return to Courses without booting the legacy workspace. Open curricula in the reader shell, and prefetch likely course destinations while preserving private access checks.

- Keep the shared header, footer and sidebar stable at scroll limits across the demo and production app. Page content scrolls within the viewport, with separate scroll areas for Administration sections and their selected panel. Scrollable surfaces leave room for overlay scrollbars beside their content and controls.
- Remove redundant Administration headings and keep its section list independently scrollable, simplify the guest account label and Courses home, move Docs/Updates category into article metadata, and add date and title sorting to learning-group content pickers.
- Display the installation name without a logo or icon in the demo and installed application. Remove logo upload from Identity settings and the redundant “Your Organization” sidebar label; give the name more room and lighter, clearer type.

- Keep course lessons and quizzes inside the shared reader route. Open a lesson with Next navigation, fetch only that course's signed-in progress, and save completion and quiz attempts through the existing server endpoint. Guest progress and explicit import after sign-in remain available without loading the full workspace.

- Open administration from a server-rendered route with a compact content index. Fetch people, reporting data and feedback only when their sections open, and load one full draft when editing. Administrator saves no longer reload the full workspace.

- Let visitors to public installations rate and comment on published Docs, Updates and Courses. Save guest feedback under a pseudonymous browser token and include it in administrator reports. Apply `20260924150351_anonymous_feedback.sql` before deploying this change to an existing installation.

- Keep Courses, Docs and Updates in one reader shell with a compact Courses catalog and current learner progress. Accept course progress submissions from either trusted Vercel preview address so guest lessons and quizzes work when opened from a deployment link.

- Reuse published Docs and Updates indexes and article bodies across reader requests, and expire them immediately after publishing or unpublishing through the web editor or administrator MCP. Installation access and personalized relevance remain request-time checks.

- Clear admin navigation warnings after confirmed settings and curriculum saves while retaining prompts for genuinely unsaved edits and blocking navigation during saves.

- Restore administrator learning-group saves on installations that require a WHERE clause for updates. Scope pending-account group cleanup to affected accounts, and show one concise error beside the group if a save fails. Apply `20260923230000_scope_pending_group_cleanup.sql` before using group administration on an upgraded installation.

- Replace the shared opening screen with a minimal, installation-neutral message and an indeterminate loading bar.

- Remove the unnecessary guest option from the demo profile picker; signed-out visitor recommendations remain available in public installations.

- Tighten built-in copy on learner, visitor and manager pages while keeping progress, safety and recovery information. Let the longer feedback prompt wrap beside its rating controls. Set the then-default footer tagline to describe Fieldbook; that footer has since been removed.

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
