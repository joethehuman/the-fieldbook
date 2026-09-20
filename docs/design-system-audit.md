# Fieldbook design-system audit and migration proposal

September 20, 2026. Scope: the shared application interface and both Next.js application entry points, not a security or backend audit. This is a source audit with the user's supplied screenshots; no new browser walkthrough was performed. Runtime observations below are distinguished from source findings. Existing automated behavior/build checks do not establish visual consistency.

## Baseline and method

Reviewed `learning-groups-work`, branch `feature/learning-groups-curricula`, at local commit `12525043ecbcf0901ba12956254f741e3bd30de1`, matching the remote PR #11 tree at `8cf995a948fd881cc643d69bd75ec5cbb3ed28c3` when the learning work was delivered. Current GitHub main was checked as `e61f4a7a396bf8ac316062cfd3f8ff8f3a075117`. The working tree was clean before this audit's documentation changes. Reconcile any newer branches before implementing the migration.

The audit inventories all 37 TSX files under `components/`, `app/` and `production/app/`, both global stylesheets, both package manifests, app layouts, existing UI documentation, contributor instructions and CI. It reviews render structure, primitive usage, field/action composition and style ownership across every UI area. Historical checkouts, generated files and synced project sources are excluded. Earlier decisions were checked against the tasks “Redesign app UI” and “Fix UI spacing and sign-in URL.”

## Conclusion

Fieldbook has the beginning of a component library, but does not yet apply a complete design system consistently. The prior redesign intentionally used custom CSS with shadcn-style Radix composition. That choice is not inherently wrong. The failure is incomplete component coverage, incomplete adoption, competing global styling and absent enforcement. The learning-group work repeated those weaknesses instead of extending the shared library.

Recommended direction: preserve the current light visual identity and behavior, adopt standard owned shadcn/Radix components with a deliberate Tailwind migration, define Fieldbook layout patterns, and make those patterns the required path for new features. A full application or backend rewrite is unnecessary.

## Findings and evidence

| Finding                                        | Evidence                                                                                                                                                                                              | Consequence                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared controls are bypassed                   | `LearningGroups.tsx` uses a native parent-group select; `Curricula.tsx` uses a native status select, while `components/ui/select.tsx` already supplies `SelectField`.                                 | The operating-system dropdown in the screenshot returns immediately on a new screen.                                                                                |
| Section switching is rebuilt locally           | `LearningGroups.tsx` sets `aria-pressed` on `.topic-tabs` buttons. Both sheets style `.topic-tabs > button.selected`; no selected class is supplied.                                                  | Active visual styling is disconnected from state. These buttons also lack the shared Tabs keyboard/panel behavior.                                                  |
| Spacing is determined by ancestry              | `design-system.css` adds margins to label children; `.learning-admin label` separately adds grid gaps. `.topic-tabs` and `.learning-admin-fields` provide no separation at their boundary.            | The tight tab-to-label boundary matches the screenshot; other fields can receive both margin and gap.                                                               |
| Two global style systems coexist               | `globals.css`: 2,965 lines; `design-system.css`: 1,919 lines. Both app layouts load both, in that order. Repeated ownership includes headings, buttons, forms, cards, tables and responsive layout.   | A new parent class can change unrelated shared elements. Later fixes require more overrides.                                                                        |
| Library coverage is incomplete                 | Eight files in `components/ui/`; no Input, Textarea, Field, Checkbox, Card, Table, Badge or Alert primitives.                                                                                         | New screens must invent or copy common form and surface structure.                                                                                                  |
| The shadcn workflow is only partly adopted     | Radix, CVA, `cn()` and shared components exist; `components.json`, Tailwind and a standard generator setup do not. `docs/ui-redesign.md` explicitly documents the custom-CSS choice.                  | Installing dependencies did not establish a standard way to add components. This is a deliberate partial implementation, not proof that no component system exists. |
| Shared controls still depend on legacy classes | Button variants map to `.primary` and `.secondary`, also applied directly in feature and production pages. Generic Tabs exports only have special styling for the admin sidebar.                      | Importing a shared component alone does not guarantee a complete, context-independent presentation.                                                                 |
| Common layouts have no owned components        | Admin embeds panel headings, then group/curriculum screens add headings; `profile-form`, `settings-panel`, `assignment-filters`, `filter-bar` and `learning-admin-fields` each set different rhythms. | Each feature author makes spacing and hierarchy decisions again.                                                                                                    |
| Themes/overlays need a shared contract         | Select/menu popovers use z-index 150; normal dialogs use 190. Branding variables are set on the `.app` subtree, while Radix portals render outside it.                                                | Review overlay stacking and brand inheritance, especially Select in a profile dialog. This is a source-identified risk, not a browser-confirmed failure.            |
| Production-only pages bypass components        | Connections, OAuth consent, progress import and sign-in use legacy classes; both privacy pages duplicate inline page widths.                                                                          | Cleaning demo/admin alone cannot make the full product consistent.                                                                                                  |
| No automated prevention                        | CI runs behavior tests and two builds; no UI-style ownership check, component catalog or visual regression job is configured.                                                                         | The exact native-select regression can pass all existing checks.                                                                                                    |

### Inventory measurements

Counts are source occurrences of JSX opening tags, not runtime DOM counts or a claim that every native element is wrong. Outside `components/ui/`, there are 72 raw buttons, 48 inputs, two selects and four textareas; alongside 55 shared Button uses, 28 SelectField uses and one Tabs root. Specialized cards, navigation, quizzes and hidden/file controls need semantic review rather than a blind replacement.

The two stylesheets contain 230 hex-color occurrences including tokens, artwork and legacy UI, and 14 `!important` declarations including reduced-motion rules. They use eight distinct numeric width thresholds (480, 600, 650, 700, 760, 1000, 1200 and 1500 px). These are inventory signals, not automatic violations. The useful measure is whether a control or pattern has one clear owner.

## Surface-by-surface migration map

| Surface / files                                                                                            | Required work                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell, docs navigation, search, demo entry, profile and course player: `Fieldbook.tsx`                 | Extract reusable page/header/navigation patterns; normalize actions and dialogs; preserve route behavior, quiz semantics and progress handlers. Split by stable responsibilities during migration, not arbitrary file length. |
| Course library and progress: `Learning.tsx`, `CourseCard.tsx`                                              | Shared section headers, filter toolbar, progress presentation, empty state and card variants. Preserve For you sequencing, completion and channel filtering.                                                                  |
| Updates: `Updates.tsx`                                                                                     | Shared headers and content-card layout, stable long-title/summary behavior; preserve grouping and date ordering.                                                                                                              |
| Admin shell, content/people lists, editor: `Admin.tsx`                                                     | One heading owner per panel, Table/actions/filter patterns, field groups and editor sidebar sections. Preserve publish/draft/version behavior and role-specific actions.                                                      |
| Learning groups and curricula: `LearningGroups.tsx`, `Curricula.tsx`                                       | First reference implementation: Select, Tabs, fields, membership/selection rows and shared ordered list. Preserve parent/team inheritance, sequencing and save semantics.                                                     |
| Assignment detail and reporting: `Assignments.tsx`, `Teams.tsx`                                            | Table, filter toolbar, section headings, status, empty/loading/error patterns and row actions. Preserve manager scope and completion calculations.                                                                            |
| Organization settings: `SiteSettingsPanel.tsx`, `PrivacySettingsPanel.tsx`                                 | Shared form sections and save area; encapsulate color/file controls; standardize Docs section ordering, policy publication, MCP setup and long addresses.                                                                     |
| People and onboarding: `PendingPeople.tsx`, `OnboardingFields.tsx`, existing profile dialog in `Admin.tsx` | Shared field structure and selection controls; IDs, helper/error associations, date input, disabled state and action layout.                                                                                                  |
| Authoring helpers: `MarkdownEditor.tsx`, `CourseCoverEditor.tsx`, `DocSectionCreate.tsx`                   | Shared toolbar/actions and form feedback; preserve upload behavior, text-selection editing, previews and non-submit buttons.                                                                                                  |
| Feedback: `Feedback.tsx`                                                                                   | Standard rating actions, form controls, filters and feedback states.                                                                                                                                                          |
| Reading: `Markdown.tsx`, both privacy pages, article rendering in `Fieldbook.tsx`                          | Scoped prose rules and shared reading container. Preserve semantic headings, tables, links and authored content.                                                                                                              |
| Server-only surfaces: `ProductionApp.tsx`, sign-in, consent and connections pages                          | Shared account shell, action/link treatment, alerts and loading/empty states without converting server data/auth concerns into UI primitives.                                                                                 |
| Foundation: eight `components/ui/` files, both layouts, CSS and package/build configuration                | Complete primitives, define token ownership, portal behavior, import contract and migration adapters. Thin route pages continue composing the shared app.                                                                     |

## Implementation sequence

### 1. Foundation and first complete example

Agree the architecture in [interface standards](design-system.md), add the standard shadcn configuration and Tailwind integration for both app roots, and complete the missing form primitives. Keep Radix to preserve existing behavior. Introduce the smallest reusable page, section, field, toolbar and action patterns needed by Learning groups/Curricula. Create the development-only catalog and guardrail baseline in the same change.

Migrate Learning groups and Curricula completely, including overlays, membership lists, course search, ordered lists, errors and empty states. Delete their ad hoc styling as it is replaced. Review this as the reference before copying the patterns elsewhere.

Acceptance: parent/status dropdowns use shared controls; group Tabs show active state and support keyboard navigation; field spacing comes from one pattern; no duplicate headings; long names and 375 px/desktop layouts work; ordering remains usable without dragging. Preserve all existing domain tests. Both builds must consume the same tokens and shared source.

### 2. Admin, editor and reporting

Move people, teams, assignments, progress, organization settings, feedback and authoring onto the approved patterns. Extract stable chunks from `Admin.tsx` as they migrate. Preserve the admin sidebar organization the user liked. Delete matching legacy selectors after each screen moves.

Acceptance: consistent fields, controls, action rows and save areas throughout admin/manager flows; no newly introduced bypasses; authorization and persistence unchanged; component-level fixes propagate to every migrated surface.

### 3. Learner and production account surfaces

Migrate the library, Updates, Docs, course player, shell/search/profile, sign-in, consent, connections, privacy and progress import. Keep rich text and decorative course artwork separately scoped.

Acceptance: guest/learner/manager/admin UI states covered; shared patterns behave in both app roots; navigation, quizzes, progress, publication, uploads and Google return navigation retain existing behavior. Run signed-in checks only against an isolated development installation.

### 4. Retire compatibility styling

Remove unused selectors/adapters and eliminate the overlap between the old global and redesign sheets. Tighten the legacy baseline as it reaches zero for ordinary application controls. Keep specialized native elements only with explicit reasons. Update the catalog and contributor documentation to describe the implemented system.

Acceptance: each primitive/pattern has one style owner; CI checks new bypasses; representative browser interaction and visual checks run; no permanent second design system remains. Record any deferred exceptions with exact locations rather than claiming a complete migration.

## Verification and scope

For runtime migration, run the existing behavior tests plus demo and production builds; add targeted component/interaction coverage rather than tests that merely assert CSS strings. Check desktop and narrow layouts, 200% zoom, long labels, keyboard-only use, focus return, error/loading/empty/disabled states and menus inside dialogs. Use the catalog for stable screenshots and selected end-to-end flows for behavior.

The initial audit was a source review. The user subsequently authorized the full implementation; the implementation record below supersedes the proposal status. This overhaul adds no database migration or production content changes.

Alternative considered: keep the custom CSS stack and build the same tokens/patterns/checks around it. It has lower initial build-tool risk and could also be consistent. The recommendation favors standard shadcn tooling because the user explicitly wants shadcn and future contributors should not have to translate every added component into a bespoke CSS dialect. Neither option removes the need for composition rules and enforcement.

## Implementation record

The full UI migration is implemented on `feature/design-system-overhaul`, based on the learning-groups feature branch. All application controls now use shared primitives; groups and curricula use proper Select/Tabs and shared sequencing; the remaining admin, reporting, editor, learner and server-only account surfaces use the same theme and composition patterns. Administration retains its desktop organization and uses a compact picker on phones.

The overlapping redesign stylesheet is deleted and the original global stylesheet is replaced with a small entry/reset. Remaining CSS has explicit theme, geometry, rich-text and artwork ownership. `components.json`, both Tailwind/PostCSS configurations, the demo `/ui` catalog, `check:ui`, browser tests and CI screenshot artifacts are added. The detailed current standard is [design-system.md](design-system.md). Native choice controls deliberately retain browser event/reset behavior behind shared components.

Final local verification (Node 22.23.2, pnpm 10.17.1):

- All 42 existing behavior tests passed (32 shared, 10 production).
- Demo and production builds passed, including TypeScript checks.
- All 16 Playwright checks passed against the built demo in installed Chrome: eight scenarios at 1440 × 1000 and 375 × 812. Coverage includes keyboard selection/tabs, long options, overlay stacking, 200% text, every admin destination, groups, curricula, course completion, learner navigation and scoped manager reporting.
- Reviewed screenshots of the component catalog, learning-group settings, course library, editor and manager report. Layout assertions cover tab-to-field spacing, channel headings, search alignment and table secondary text.
- UI ownership checks passed. A temporary deliberate violation confirmed that raw feature controls and nonsemantic palette classes are rejected; the probe was removed.
- Removed the 1,919-line override sheet; total handwritten CSS fell from 4,884 to 1,224 lines (75%). This measures source cleanup, not a runtime performance benchmark.

Browser tests use synthetic demo data, not an authenticated hosted installation. Real Google sign-in, real uploads and installed backend persistence are outside those browser checks. No hosted database migration, production content update or merge was performed. The underlying learning-groups branch still requires its separately documented migration before installation.

## Composition follow-up

Review of the first implementation found that shared controls did not adequately constrain their composition: sidebar text centered when it wrapped, header descriptions could become a separate flex column, reorder actions followed label length, account typography inherited command-button defaults, card arrows wrapped independently, feedback links ran into status text, and automatic table sizing redistributed columns after filtering.

This follow-up introduces explicit SectionHeader title/description/action slots, CollectionToolbar, AccountButton, ReorderRow, CardFooter, StatusActions and declared DataTable schemas. All six application data-table views use stable schemas; prose tables retain their natural layout. The shared table container also contains visually hidden labels, preventing offscreen action headings from widening a narrow page. Numeric columns align consistently. Docs and course sequencing share the same row pattern; actions move below the title in small containers and with enlarged text. A shared focus-only SkipLink preserves keyboard access without painting an offscreen element into full-page screenshots.

The component catalog demonstrates long labels, account identity, status/action spacing and a table with populated/empty states. The interface checker now rejects unconstrained application Table usage, with explicit exceptions for shared implementation, the primitive catalog and Markdown. AGENTS.md and the standards specify composition and state-change checks in addition to component reuse.

Follow-up verification: both builds, all 42 behavior tests and all 33 browser checks passed with Node 22.23.2 / pnpm 10.17.1. The browser suite now runs eleven scenarios at 1440 × 1000, 1024 × 900 and 375 × 812, including a 200% text check with sequencing visible, Docs keyboard/drag reorder and save/reload, unchanged report column positions across teams and empty results, header/action alignment, and feedback/card spacing. Screenshots of the reported surfaces were reviewed at desktop, tablet and phone widths. The new data-table ownership rule was also checked with a temporary rejected fixture, then the fixture was removed. This remains local demo/build verification; hosted authentication, uploads and database behavior were not exercised or changed.
