# Fieldbook design system

Fieldbook’s design system is the shared interface code in `components/` and `styles/`, together with the usage rules in this guide. The installed app and interactive demo use the same components. The demo’s `/ui` catalog shows representative examples; it is not a complete inventory or a separate implementation.

This guide is for contributors changing the interface. Read [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup and review expectations.

## Where the interface lives

| Layer | Location | Responsibility |
| --- | --- | --- |
| Theme | `styles/tokens.css` | Colors, typography, spacing, radii and sizing |
| Primitives | `components/ui/` | Buttons, fields, dialogs, menus and other basic controls |
| Patterns | `components/patterns/` | Shared page composition, navigation, forms and tables |
| Product components | `components/` | Reusable feature interfaces, including cards and editors |
| Workspace layout | `styles/layout.css` | Application shell and feature geometry |
| Learner presentation | `styles/learner.css` | Learner layouts using the shared theme |
| Content and artwork | `styles/content.css`, `styles/artwork.css` | Reading surfaces and decorative media |

Before building a component, inspect the shared code and relevant `/ui` example. Reuse or extend an existing owner when it already provides the behavior. Keep route-specific data fetching, permissions and mutations in the owning feature. Create abstractions for demonstrated reuse, and avoid copying a control into another feature or adding options for speculative layouts.

## Visual foundations

The interface uses shadcn/ui source composition, Radix interaction primitives, Tailwind CSS 4, Geist, Lucide and semantic theme variables. The BlockNote editor uses its own shadcn integration within the shared theme.

Use the existing typography, spacing, color, radius and surface tokens. Refine shared styles at their owner rather than adding page-specific overrides or literal interface colors. Learner, management and authoring views share the same neutral visual language. Installation branding, authored artwork and semantic status colors have distinct purposes; keep those meanings consistent.

Use the shared authored-content tokens for headings and named text or highlight colors in both writing and reading views. Keep text readable against its background. Decorative artwork can use its own palette without changing the application’s control or status colors.

A parent layout owns spacing between sections; a field group owns spacing between fields. Preserve the shared control sizes and variants. Align controls through their surrounding layout instead of stripping padding or adding compensating margins to individual controls.

## Compose pages with shared patterns

| Need | Use |
| --- | --- |
| Page title, description and actions | `SectionHeader` |
| Collection search, filters, sorting and actions | `CollectionControls` or `CollectionToolbar` |
| Form labels, guidance and validation | `Field`, `FieldDescription`, `FieldGroup` and `FieldError` |
| Application records in a table | `DataTable` with a column schema, inside `TableContainer` |
| Commands and navigation | `Button` for actions; links for destinations |
| Panels and choices | Shared tabs, selects, comboboxes and dropdown menus |
| Settings sections and save areas | `SettingsSection` and `SettingsPageActions` |
| Application navigation and chrome | `WorkspaceFrame` and `AppBar` |

Use the existing shared card components for content collections. Plain tables remain appropriate inside authored content. Keep shared components responsible for their presentation and interaction, with the owning feature supplying records and actions.

Reuse the existing save pattern. Ordinary settings saves stay in normal flow; retain the shared pending-change bar where a page already stages long reorganization work. Keep save controls reachable and clearly distinguish unchanged, unsaved, saving and failed states. Draft saving and publication are separate actions and states.

## Interaction and accessibility

Use semantic elements, visible labels, accessible names and clear focus indicators. Associate guidance and errors with their fields. Icon-only controls need meaningful accessible names; decorative icons should not create duplicate announcements. Keep touch targets usable without changing the meaning of a control at different widths.

Reuse the shared dialog and menu primitives so keyboard navigation, focus return, dismissal and background interaction remain consistent. Single-choice controls close after an enabled choice is activated, including reselection; multiple-choice controls retain their selection workflow. Non-submit actions inside forms must use explicit button types.

Preserve a person’s working context during filtering, sorting, navigation and responsive changes. Keep selected records and unsaved input intact unless an action deliberately changes them. Reordering interactions need a keyboard alternative to dragging. Confirm destructive operations through the existing confirmation pattern and describe their actual effect.

Use shared empty, loading, error and success states. Failure messages should explain the problem and next action, with a reference when available. Operation failures must be dismissible; dismissing a notice must not discard input, clear validation or hide the controls needed for recovery. Announce meaningful state changes to assistive technology without adding repeated visible status copy.

Respect reduced-motion preferences. Animate transitions only when they clarify a change, keep closing surfaces non-interactive, and avoid animating responsive layout changes.

## Layout and responsive behavior

Use the shared workspace shell across learner, management and authoring routes. Preserve its header, navigation, search and page insets instead of recreating them within individual features. Reading surfaces keep a comfortable text measure; controls and metadata must remain usable with long content and enlarged text.

Choose layouts according to available space and input capabilities. A narrow desktop window does not automatically require touch-editor behavior. Use the existing layout hooks and matching CSS rules rather than introducing competing breakpoints.

Keep scroll ownership explicit. The workspace normally owns page scrolling; bounded lists and desktop writing surfaces may have their own scroll areas. Preserve vertical scroll chaining, contain wide tables horizontally, and keep controls reachable on short screens. Avoid global overflow locks and competing wheel, focus or viewport correction mechanisms. Use the shared scroll-fade treatment only where content actually overflows.

## Shared authoring

Docs, Updates and Course lessons share the BlockNote writing editor. Preserve the desktop composition of title, writing column, Outline, Details, save status and publication actions. Use BlockNote’s supported APIs and component slots for native editing, selection, menus, tables, code and media. Scope theme adaptations to the editor; keep its own menu primitives and focus behavior intact.

Use the existing [compact-touch layout boundary](../components/patterns/use-editor-cards-layout.ts) to determine when desktop editing is required. Restricted layouts show the shared desktop-editing notice. Reading and ordinary administration remain available, and narrow mouse-driven windows retain editing. Preserve draft ownership, pending saves and recovery when an open editor crosses that boundary.

Treat saved writing as user data. Preserve text, block properties, media references, image descriptions and draft/publication separation through edits, paste and undo. Opening an editor or menu must not save a conversion. Structured blocks are authoritative when present; generated Markdown is an export. See [editor compatibility and upgrades](upgrading.md#block-documents-and-editor-compatibility) for storage, export and rollback guidance.

## Examples and verification

When adding or changing a shared component, update its representative `/ui` example using the actual component and synthetic data. Show the states needed to understand its use and accessibility. Record non-obvious implementation constraints beside the owning code; use focused regression tests for behavior that must remain stable.

Review the affected empty, loading, error, disabled, selected and long-content states. Exercise keyboard interactions, responsive layouts and enlarged text where relevant, including focus and scroll behavior after opening menus or saving. Check both the installed app and demo when shared behavior changes.

Run `pnpm check:ui` and checks appropriate to the change, following [CONTRIBUTING.md](../CONTRIBUTING.md#check-the-changed-behavior). Review rendered results as well as test output. Browser-local demo checks do not establish hosted authentication, permissions or persistence.

Keep this guide focused on shared design decisions. Feature workflows, exact interface copy and implementation mechanics belong with their owning code, tests or product documentation. Update existing guidance when behavior changes rather than accumulating instructions for every individual fix.

Adapted component-source attribution is in [third-party notices](third-party-notices.md).
