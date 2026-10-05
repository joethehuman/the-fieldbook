# Fieldbook design system

Fieldbook uses one owned interface library across the installed app and demo. Its foundations are shadcn/ui source composition, Radix interaction primitives, Tailwind CSS 4, Geist, Lucide, and semantic theme variables. This guide is for contributors changing the interface; the current components and demo-only /ui catalog show the implementation.

## Where decisions belong

| Layer | Location | Owns |
| --- | --- | --- |
| Theme | styles/tokens.css | Colors, type, spacing, radii, and page measures |
| Primitives | components/ui/ | Controls, fields, dialogs, menus, cards, tables, and feedback |
| Patterns | components/patterns/ | Repeated page composition and navigation |
| Application layout | styles/layout.css | Shell and feature geometry |
| Reading and artwork | styles/content.css and styles/artwork.css | Authored content and decorative media |

Use existing primitives and patterns before creating a new one. Put reusable behavior and styling in the shared layer; keep data fetching, permissions, and mutations in the owning feature. Avoid a second feature-specific control system or broad overrides. The design system is a small set of reliable defaults, not a reason to turn every layout into a configurable component.

## Compose a page

- Use SectionHeader for a section's title, description, and actions. Use CollectionControls or CollectionToolbar for search, sort, filters, and creation actions.
- Use Field, FieldDescription, and FieldGroup for forms. Associate help and errors with controls, mark invalid fields, and keep labels visible.
- Use Button for commands; use an actual link for navigation. Use Tabs for panels, FilterOptions for collection filters, SortPicker for ordering, and DropdownMenu for actions.
- Use DataTable with a declared column schema for application records. Keep horizontal overflow inside TableContainer. Plain tables remain appropriate for authored content.
- Authored tables use GFM Markdown plus an optional versioned width comment at the start of the body. The visual editor and reader consume that comment; plain Markdown tables without it retain automatic sizing. Keep table width changes in the content field so draft, publication, and Markdown export carry the same layout.
- Use shared dialog and picker patterns. Keep search and actions reachable while result lists scroll. Preserve keyboard selection, dismissal, and focus return.
- Use the shared publication, progress, empty, error, loading, and pending-save states. A published item with newer draft edits must show both facts.
- For explicit manual saves, compare the draft with its saved baseline in the owning form and use SaveChangesControl. Keep Save visible but disabled when nothing changed. In settings footers, keep the gray save area compact and place a quiet Discard action just below it when editing begins. Announce unsaved and saving states to assistive technology without adding visible status text; explain any other reason that blocks saving. Guard form submission as well, so pressing Enter cannot save an unchanged draft. Automatic draft saves and publication actions have their own states.

A parent layout owns the space between sections. A field group owns the space between fields. Individual controls should not add compensating margins. Use semantic theme tokens rather than literal interface colors; decorative artwork and validated runtime branding are separate cases. Text must remain readable when it wraps or grows.

## Layout and accessibility

The workspace owns normal page scrolling. Nested lists may scroll when bounded, but short screens and enlarged text must still reach every control. Do not solve a sizing problem with a global overflow lock. Tables and horizontal strips scroll within their own containers without trapping vertical page scroll.

Use semantic elements, accessible names, visible focus, and keyboard-operable controls. Check empty, loading, error, disabled, selected, and long-content states. Review desktop, tablet, phone, and enlarged-text layouts. An attractive initial screenshot does not establish that a control works after filtering, opening a menu, or saving.

## Verify interface work

The demo-only /ui route shows shared components with synthetic content. Extend it when adding a reusable pattern. Run checks appropriate to the change:

~~~sh
pnpm check:ui
pnpm test:ui
~~~

Build the demo and install the browser required by Playwright before its browser tests, as described by the scripts in package.json. Review the resulting screenshots as well as test output. Check both apps for shared changes. A local browser check does not prove a hosted installation's authentication or data behavior.

Adapted component-source attribution is in [third-party notices](third-party-notices.md).
