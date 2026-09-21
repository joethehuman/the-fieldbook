# Fieldbook design system

Fieldbook uses one owned component library across the demo and server application. The foundation is shadcn-style source composition, Radix interaction primitives, Tailwind CSS 4, semantic theme variables, Geist and Lucide. `components.json` configures the standard shadcn source workflow. There is no independent feature-level control theme.

## Ownership

| Layer              | Source                                     | Responsibility                                                                                                                                                                                          |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme              | `styles/tokens.css`                        | Interface colors, type foundation, radius, spacing and container dimensions.                                                                                                                            |
| Primitives         | `components/ui/`                           | Buttons, inputs, textareas, fields, choices, selects, tabs, dialogs, menus, cards, tables, alerts, badges and progress.                                                                                 |
| Patterns           | `components/patterns/`                     | Page/section headers, stacks, split layouts, toolbars, search fields, filters, actions, callouts, empty states, account/reading layouts, responsive navigation, group pickers and ordered course lists. |
| Application layout | `styles/layout.css`                        | Shell and feature-specific geometry that cannot use an existing shared composition. Never a second set of control styles.                                                                               |
| Content            | `styles/content.css`, `styles/artwork.css` | Scoped reading/media styles and decorative sample-course artwork. Artwork colors do not define interface colors.                                                                                        |
| Entry point        | `app/globals.css`                          | Tailwind imports, explicit shared-source scanning and a minimal base reset. Both application layouts import this one file.                                                                              |

The old `app/design-system.css` override sheet is deleted. Do not restore it or add another page-specific override sheet. Styles use explicit cascade layers so application geometry cannot silently override primitive utilities.

## Build UI by composition

Start with existing primitives and patterns. For example, use `SectionHeader`, `FieldGroup`, `Field`, `SelectField` and `ActionGroup` for a settings section. The parent layout owns space between sections; FieldGroup owns space between fields; Field owns label-to-control spacing. Avoid additional margins on their children.

- Use **Button** for commands and icon actions. Choose a shared variant; set button type explicitly inside forms. Use `asChild` with a real anchor when presenting a link as a button.
- Use **SelectField** for option selection, **Tabs** for panels, **FilterOptions** for collection filters and **DropdownMenu** for actions. Do not interchange their semantics.
- Use **Field** for labels and **FieldDescription** for help. Associate separate help/errors through IDs and `aria-describedby`; mark invalid controls with `aria-invalid`. Use horizontal fields for choices and the choice variant for quiz answers.
- Use **TableContainer** with Table and its row/cell primitives for data. Overflow belongs inside the table container, never on the whole page.
- Use **Card**, **Alert** and **EmptyState** for surfaces and state feedback. Do not duplicate their backgrounds, borders, radius and padding in a feature stylesheet.
- Use **ResponsiveTabsNavigation** for dense administration navigation: grouped desktop tabs and a compact section picker on narrow screens. Both drive the same selected section and unsaved-change handler.
- Use **OrderedLearning** for playlist sequencing. Dragging has keyboard and up/down alternatives. Do not import reusable UI from another feature screen.
- Keep course assignment, authorization, fetching and mutation logic in features/server code. Presentation refactoring must preserve publishing, completion, autosave, explicit Save, revision checks and navigation behavior.

Inputs, textareas and native choices retain browser form semantics. `Checkbox` and `Radio` intentionally wrap native inputs to preserve existing change events, radio keyboard behavior and form reset. Hidden, file, color and date inputs also stay native inside the shared Input wrapper. These are owned, consistently styled primitives, not permission for raw feature controls. Rich content tiles use the shared `ContentAction` pattern instead of command-button sizing.

## Composition contracts

Shared controls are necessary but do not establish a consistent page by themselves. Use these patterns rather than arranging their children independently:

- `SectionHeader` requires a `title`; `description` always stays below it. Children occupy the trailing action area. Use `CollectionToolbar` to separate collection filters from creation actions.
- Sidebar tabs use a fixed icon size and left-aligned labels. Account identity uses `AccountButton`, with dedicated avatar, wrapping name/role and action columns. Do not style it as a generic navigation item.
- `ReorderRow` owns handle, flexible text and aligned action columns for both Docs and course sequences. Keep interaction/persistence handlers in the owning feature. Text length must not move action columns.
- `CardFooter` keeps action copy and its arrow together and anchors metadata consistently. Use `StatusActions` for saved-state copy with an adjacent action; it supplies a real gap and wraps intentionally.
- Application data uses `DataTable` with a declared view schema. Column widths are independent of the filtered records, counts use consistent numeric alignment, and narrow layouts scroll inside `TableContainer`. Plain Table remains appropriate for authored Markdown and primitive examples. Add a central schema for a new table rather than allowing content to choose its geometry.
- Keep the browser's scrollbar space stable. Use the shared focus-only `SkipLink` for keyboard access to the main content.

Acceptance checks must exercise state changes, not just initial screenshots: long and short labels, populated and empty results, reporting-team changes, desktop/tablet/phone widths and enlarged text. Compare column positions before/after filtering and action alignment across differently sized rows. Inspect screenshots after the interaction checks; passing overflow checks alone is insufficient.

`ProgressStatus` is the compact course/curriculum indicator: an empty or partial ring with text, or a completion check. Its caller owns the completion calculation. `CourseRow` owns overflow observation, keyboard scrolling and endpoint controls. Use `ContentAction` with `focusRing="inside"` inside clipping containers so keyboard focus remains visible. `SplitPanel` has an explicit stretch option for equal-height summary/card compositions.

## Theme and layout rules

Keep the light, neutral visual direction. Primary actions are neutral; organization branding uses `--brand`, separate from shadcn's semantic `--accent` surface. This prevents operator branding from changing menu/selection contrast. Radix portals inherit the root interface theme; popovers sit above ordinary dialogs, and confirmation overlays sit above both.

Use semantic utilities such as `bg-background`, `text-muted-foreground` and `border-border`. Literal interface colors belong only in tokens. Decorative artwork is the explicit exception. Inline styling is limited to runtime values: validated branding and progress values owned by their primitives.

Use the shared spacing scale (4, 8, 12, 16, 24, 32, 48 px). Standard controls have a 36 px minimum height and a 32 px compact option; content can wrap and grow. The base radius is 8 px with named variants. Do not independently choose new field heights, margins, radii or colors for a feature. Preserve readable prose spacing separately from compact interface text.

Before creating a new layout, check the pattern library. Extend a shared variant or add a small reusable pattern when necessary. Semantic HTML and genuinely specialized geometry remain appropriate; a generic component with dozens of flags is not the goal.

## Next.js and performance

Both app roots use the same source and theme. Keep noninteractive primitives server-compatible and add client boundaries only for interactivity. Preserve the lazy-loaded admin bundle, local Geist font loading and direct component imports. Tailwind generates static CSS at build time; do not add runtime styling dependencies to solve layout problems.

The root and production manifests must resolve matching Next/React peers. Browser testing is declared in both because Next has an optional Playwright peer; mismatched peer sets can create separate Next module instances in this shared-source repository. Keep the lockfile reproducible with the repository's pnpm version.

## Component catalog and checks

The demo-only `/ui` route is the reference catalog. It uses synthetic examples of actions, field states, choices, dropdowns, tabs, a dialog containing a Select, a table and an ordered list. No catalog route is added to the server application. Extend this catalog when adding reusable patterns.

Run:

```sh
pnpm check:ui
pnpm test
pnpm build
pnpm build:production
pnpm exec playwright install chromium
pnpm test:ui
```

The browser suite serves the built demo, or reuses an existing local demo on port 3117 outside CI. Set `FIELDBOOK_TEST_PORT` to use a different port when working in multiple checkouts. To use installed Chrome locally, set `PLAYWRIGHT_CHANNEL=chrome`. CI installs Chromium, runs the suite and uploads screenshots/traces and the HTML report for review.

`check:ui` parses TSX and CSS. It rejects raw feature controls, hard-coded interface colors, retired class hooks, static inline feature styling, native-control overrides in the layout sheet and `!important`. There is no legacy allowlist for feature controls. Explicit implementation exceptions are confined to UI primitives, the rich-content tile and the runtime branding token. Do not weaken the check to ship a feature.

Browser tests cover desktop, tablet and phone layouts, keyboard Select/Tabs, long options, enlarged text, dialog/popover stacking, group persistence, curriculum sequence, all admin destinations, editor rendering, learner navigation, course completion and manager scope. Screenshots are review evidence; they are not automatically approved visual baselines. Review affected screenshots and test applicable empty/error/loading/disabled/focus states. A passing build alone does not establish visual quality or authenticated production behavior.

## Review requirements

1. Reuse or extend a shared primitive/pattern before adding feature styling.
2. Preserve heading hierarchy, label associations, focus and keyboard behavior.
3. Check narrow screens, long content and enlarged text; keep data tables independently scrollable.
4. Remove superseded CSS and unused imports/components in the same change.
5. Record checks and limitations. Distinguish demo tests, server builds, isolated-backend tests and live installation checks.

Reference conventions: [shadcn composition](https://ui.shadcn.com/docs), [theming](https://ui.shadcn.com/docs/theming), [configuration](https://ui.shadcn.com/docs/components-json).

## Learning collections and launch pages

`LearningCard` is the shared anatomy for courses and curricula. Supply artwork, metadata, status, title, description and action; do not lay these out again in a feature. Artwork has a fixed 10rem height and never shrinks. Metadata and status occupy separate, consistently spaced rows, titles reserve two lines but may grow, descriptions wrap without truncation, and CardFooter anchors the action. CardGrid uses a common 18rem minimum card width, 16px gaps and equal-height rows. CourseRow uses the same 18rem card width, capped to its container on narrow screens. ContentAction owns borders, focus, hover and clipping.

`CourseRow` owns its SectionHeader as well as scrolling. Pass a heading and optional description; overflow arrows occupy the header's trailing action slot. Optional `leading` content shares a stretch-aligned SplitPanel with the cards. Never position arrows with negative offsets or compensate with feature-specific header padding. Hide arrows when content fits; disable only the unavailable direction at a scroll endpoint.

`BrowseToolbar` aligns labeled fields to their control baseline and wraps whole fields on narrow screens. Use Search, a single Channel SelectField, and Sort for a full collection browser. A short fixed set of primary views may use FilterOptions; growing taxonomies belong in a dropdown. When a home page already groups cards under channel headings, do not repeat channel filter buttons. Result counts and Hide completed belong in the SectionHeader action area, separate from search/sort controls.

`LaunchList` presents a learner's ordered sequence: number, flexible title/description/status, and an aligned launch action. It is distinct from the editor's OrderedLearning. Curriculum detail pages use this simple list with a PageHeader and progress/next-course action. Do not add sorting, channel filters, nested accordions or course editing controls to a learner playlist.

The `/ui` catalog demonstrates mixed course/curriculum cards, the labeled browser toolbar, and the ordered launch list. Verify mixed title lengths, metadata wrapping, equal card/footer alignment, header controls, keyboard focus, narrow screens and enlarged text whenever these patterns change.

## Account identity

`InstallationIdentity` and `InstallationLogo` provide the workspace/account wordmark and failed-image fallback. `BrandedAccount` composes them with `AccountPage` and the published privacy link. Use the same identity on sign-in, consent and connection pages; keep each page's purpose, provider actions and authorization outside the shared pattern. The demo profile picker uses this layout with explicit simulation disclosures. The `/ui` catalog includes the shared identity.
