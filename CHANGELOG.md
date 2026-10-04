# Changelog

No versions have been released. Package and MCP version strings do not constitute a GitHub Release. See the [release process](docs/releases.md).

## Unreleased

- The administrative Content table shows Name, Type, Status, Updated and Created. Dates use `04-Oct-2026` formatting, with the content version beside Updated; existing date sorts retain full timestamp precision.

- Refine phone authoring with right-aligned Outline/Details buttons and smoothly animated bottom panels with safe-area breathing room, explicit selected-text formatting alongside native selection menus, and a canvas that stays in natural page flow from its empty first paragraph, with keyboard clearance and smooth caret scrolling without resizing the canvas. Omit Focus mode on phones. Simplify the phone Administration picker and use a searchable Teams directory while retaining tablet and desktop layouts.

- Updates use an unchecked Bring this update to the top choice in Details → Publishing. Republishing corrections preserves feed position and For you freshness; selecting the choice deliberately renews the feed date. First publication remains current. Demo, installed publishing and MCP share the rule; course versions and completions are unchanged.

- Docs navigation settings align section names and document counts, group the display toggle with section creation, and support document and subsection reordering and cross-section moves with drag origin/destination feedback, individual and bulk Move to actions, and a sticky Unsaved changes bar with Save/Discard. The bar opens smoothly as a connected header with continuous container borders and an immediate reduced-motion fallback; brief footer guidance spans the full grey area. Navigation changes preserve document drafts and published editorial content.

- Size application table columns to content up to shared maximum measures, wrap long names and metadata, and reserve surplus width between the last data column and the pinned action menu. Apply the same sizing across administrative, reporting and review tables.

- Clarify Teams bulk selection with an outlined Select multiple control beside search and Add team, a visible Done selecting exit, and the standard paginated table with header checkboxes and the existing bulk-action toolbar.

- Unify collection sorting with one compact design-system picker that opens options directly, shows its label inside the trigger and wraps cleanly on narrow screens. Use concise shared terms with directions in parentheses, such as Sort: Updated (newest) and Title (A–Z), and paired useful directions across learner libraries, administration, reports and assignment/import dialogs. Add saved-deadline sorting, retain Assigned sorting in Your courses, keep unknown values last, and remove misleading curriculum dates, redundant recovery ordering and the one-option CSV issue picker. Preserve authored curriculum order, search relevance and report/export consistency. Align the Courses home and full browser with shared inline search, Filters and Sort controls; show active categories as removable chips.

- Simulate Ask AI in the browser-local demo with the shared thinking indicator, streamed canned replies and working Stop control. The first two questions receive Hoolibook/Gavin replies, with a link to thefieldbook.org in the first; later questions receive the demo-unavailable message. No model requests are made.

- Prevent the demo account picker from flashing during session refresh. Check the saved profile before first paint and retain an inactive workspace shell until restoration finishes; first visits, explicit profile switching and storage recovery keep the picker.

- Align Admin row and bulk menus across content, people, teams, groups, curricula, Docs sections and recovery. Bulk actions require at least two selected records; individual menus retain applicable commands for a single record and reuse existing reviews and safeguards.

- Refine generated artwork across the original ten motif families and thirty recipes. Seed-driven rhythm, proportion and placement vary each composition; quieter linework and unoutlined color shapes add depth while preserving coherent geometry. Refresh existing generated cards and automatic defaults to version 6 while preserving seeds and short titles; uploaded images remain unchanged. The refresh stays deterministic and needs no data rewrite. Keep Identity palettes, text overlays, card layouts and save/upload behavior unchanged.

- Refine course and curriculum cards with type/category labels, centered For you or soft red Past due badges, icon-led learning details and a compact progress/action footer. Use existing assignment deadlines consistently across the library and curriculum pages.

- Replace About this demo with the reset confirmation instead of stacking dialogs; Cancel returns to About without changing sample data.

- Add one installation-branded Open Graph/Twitter image for every link, using only public name, canonical domain and accent. Use the Paper design with four evenly spaced page lines; private content remains protected. Keep the shared template separate for future customization, without new Admin controls. Patch Next.js to 16.3.6 for the image-renderer security fix.

- Simplify curriculum cards with a quiet metadata footer, edit-linked names and one action menu. Align shared menu highlights and nested team highlights with their containing corners. Add course search, status filters and newest-assigned sorting to person progress details, keeping CSV exports aligned with the displayed rows. Move Curricula into Publishing, reorder Organization settings, rename People & courses to People & Progress and Learning groups to Groups in the interface, explain their role alongside team assignments, and clarify membership metrics as teams linked and direct users linked.

- Refine administrative tables and People progress with compact shared rows, quieter record metadata and persistent row-action menus. Make names edit links, show reporting teams in People, simplify row completion to a ring and percentage, and keep action menus visible while horizontally scrolling. Add direct Learning-group membership and assignment shortcuts, align Teams selection into a compact list, and use labeled icon counts for membership and hierarchy.


- Remove course-video theater mode and custom resizing controls; rely on native browser and embedded-provider controls for fullscreen.

- Default course category rows to newest courses first and For you to oldest assignments first. Show published curricula beneath the homepage categories, remove separate Browse curricula shortcuts, and keep authored Recommended order as a sort inside each curriculum.

- Prevent the account menu's ellipsis focus ring from lingering after pointer selection, while preserving keyboard focus restoration and dialog focus.

- Preconfigure fresh and reset demos with codebase and thefieldbook.org links through the existing External links settings and account menu. Preserve saved browser settings until Reset demo.

- Restore and reactivate exact-email Recently deleted users through CSV Import, with a non-blocking review warning and stable identity/history. Keep purge, inactive-user and access guards. Apply `20261003222648_roster_import_reactivation.sql` before deployment; it rewrites no existing data.

- Compact People and CSV review tables, use User labels and show complete proposed records in import details. Disable browser saved-form suggestions by default in shared text controls. Review manager deletion without requiring a replacement, and add reviewed bulk team deletion that returns direct users and surviving immediate subteams to Organization. Surviving branches retain their users and nested subteams. Apply `20261003212205_roster_team_deletion.sql` before deployment; the upgrade preserves existing data.

- Refine people imports with opening feedback for the native file chooser, status count badges, one Issues tab and a 2,000-row file limit. Let nested Groups lists hand scrolling back to person dialogs at their edges. Add Recently added People sorting, separate from hire date; its additive roster timestamp migration leaves historical dates unknown.

- Import people and teams from a reviewed CSV in one transaction, with stable identities, stale-review protection and safe retries. Use an inline blank-template link, readable field changes and shared scroll fades. Align individual pre-registration and demo profiles with the same modal frame. See [CSV import](docs/roster-import.md); apply its additive database migration before deploying.
- Unify visual-editor block actions and image settings, place table handles on grid edges with row/column movement indicators and menu alternatives, retain formatting tools for whole-paragraph selections, and offer Divider in the Commands and slash menus.

- Coordinate Focus mode transitions with the outline and details panels, keep the moving canvas opaque with synchronized text/media resizing, and make Enter from a lesson title start on an empty line above the first block, including video.

- Unify visual writing and preview with inline player-style media, editable lesson titles inside the canvas, contextual media controls, and Focus mode that expands the existing editor. Offer Markdown downloads from the toolbar’s more menu, retain source recovery for unsupported content, autosave and separate publication.

- Refine the shared neutral design system with consistent rounded controls and surfaces, quieter outline actions, inset search icons, and clearer course-card title hierarchy. Preserve existing page structure and workflows.

- Align course counts in soft shared badges, add subtle card lift and elevation, and make hover highlights immediate across shared controls and navigation. Refine quiz results with grouped completion actions and a clearer keyboard-accessible answer review while preserving grading and retry behavior.

- Give quiz reviews a numbered gutter and inset answers, preserve separate multiple-choice selections, and let longer reviews filter to incorrect answers. Add real-component catalog examples with one, two and ten questions without changing saved course progress.

- Fit desktop content editors to the available workspace, keeping titles and controls visible while overflowing writing, Outline, Details or Quiz panes scroll independently. Use natural page scrolling on narrow or short screens so every control stays reachable.

- Keep independent navigation, outlines and picker lists from scrolling their surroundings at either end. Preserve compact popup sizing, keep picker search/actions visible, and cap searchable popups to their actual available space.

- Give Administration sections, saved editors, organization details and individual progress views their own URLs. Refresh and direct links reopen the current destination, with existing permissions and unsaved-work protection. Courses collections use `/courses/for-you`, `/courses/yours`, `/courses/in-progress`, `/courses/completed`, `/courses/all` and `/courses/curricula`; course and curriculum exits preserve the launching collection. The static demo uses the same destinations after `#`. No database migration is required.

- Keep course assignment search, filters, pagination and actions stationary while only the course list scrolls. Give the chooser more vertical room and show conditional edge fades with the shared scrollbar styling.

- Reuse the Course audience modal for course and curriculum bulk assignments and Learning Groups course addition/removal. Keep Select, Review, Save and discard in one frame, preserve search on Back, and retain other assignment sources and saved deadlines.

- Expand fresh and reset Hoolibook demos to a fixed fictional organization with 200 people, 50 teams, six cross-team learning groups, four curricula, and dated assignment and completion records. Use teams for department learning, keep the same four selectable profiles, and give the Sales manager regional and segment sub-teams to explore. Preserve existing browser workspaces until reset; no database is required.

- Explain course audiences through explicitly named curricula and linked groups. Teams covered by a selected group appear included; current-person overlap stays selectable. Park new redundant team choices, preserve saved independent assignments, and distinguish existing recipients from newly included people. Demo sample data is unchanged.

- Use a compact, stable audience workflow across Course and Update Details. Choose Organization or specific audiences, preserve saved sources, keep search geometry stable, and review course consequences without replacing the dialog. Updates apply to the draft before explicit Publish. Name the configured public guest group and include any registered members in its reach; public access never creates a group automatically.

- Share one team/group audience picker across Course and Update Details. Organization and parent teams explain which audiences are already included; retain existing separate/curriculum links and keep configured public guests separately selectable. Update team targeting stays in drafts until Publish and creates no completion requirement or deadline.

- Smooth Ask AI router bursts into progressive text with AI Elements' built-in word fade and calmer thinking dots. Hide internal citation IDs until verified numbers are ready, use shared source tooltips, and gently reveal expanded sources within the chat pane. Respect reduced motion and retain Stop without moving the page or composer.

- Let Ask AI respond naturally to greetings and clarification when published-content retrieval is empty, regardless of punctuation. Replace the shifting Answering label with clearly moving, staggered thinking dots in the pending assistant position, static with reduced motion.

- Keep Ask AI answer style under administrator guidance, with a clarity-first concise default and no hardcoded sentence/paragraph rule. Show verified citations as consecutive clickable numbers with a compact expandable source list, combining passages at the same destination. Let responses without citations complete without a warning. Clearing Search closes the panel; focusing an empty field leaves it closed until typing resumes.

- Let Ask AI answers with more than three valid citations complete and display every verified source link. Keep concise answer guidance and reject unknown or stale sources.
- Preserve the server-owned Organization identity when saving installation settings. Use a direct settings save with automatic confirmation after a lost response, ordinary retry after failure, and unsaved-navigation warnings only while edits remain. Remove the separate settings recovery action while retaining revision checks against concurrent changes.
- Make Ask AI administration provider-neutral: off shows only the switch; on shows the server-selected router, primary/fallback models, published sources and answer guidance. Remove manual setup/model-test controls and provider-specific pricing/policy panels. Bind saved models to router identity, allow catalog IDs without vendor prefixes, and enforce declared fallback capability. Vercel remains the only implemented connector.

- Add an off-by-default Ask AI server foundation: active-reader streaming through Vercel AI SDK/Gateway, bounded published-passage retrieval with current source links, portable provider interfaces and nonsecret settings. The additive service-only migration preserves ordinary search and installation data. The shared search panel now launches a temporary chat using a question mark plus Enter or Ask AI, with a consistent viewport-bounded height, full-width composer and separate action row, follow-ups, Stop, Retry, New conversation and verified source links. Messages scroll above the composer; new chats open without introductory copy. Search returns to its first results when leaving chat. Demo submissions respond locally without AI calls. Organization Settings adds enable/disable, a required installation-selected primary and optional approved Gateway fallback, live compatible model choices, published source selection, concise answer guidance and automatic metadata-only setup checks. No model or promotional expiry is built into defaults; saved choices survive disable/re-enable, and failover does not overwrite them. Nonsecret configuration uses revision-checked saves; credentials remain server-only.
- Replace the editor’s permanent Draft recovery section with a confirmed Revert to published version action at the bottom of Details. Group quiet save and unpublished-edit text beside the publication pill and a consistent Publish action in one header line, with deliberate compact labels instead of clipped text on phones. Failed saves retain open work and offer a primary revision-checked retry plus quiet saved-draft reload and download actions without changing live content or learner progress.
- Share Admin Progress and manager Team progress with a people-up-to-date ring and learning-status chart. Lead with the permitted reporting scope and charts, followed by one grouped team/people search plus optional filters and sort controls. Keep applied filters in a left-aligned row above People, with a brief height transition and no empty spacer. Preserve full focus rings in Admin/Contributor scroll panels. Include active preregistered people, separate new-user timing from overdue status, preserve filters/page/scroll through person details and export the same matching rows across pages. Read authorized person totals without course bodies or attempts; recheck access and report values before CSV downloads. Apply `20261002232135_progress_report.sql` before deploying the matching server code.

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
