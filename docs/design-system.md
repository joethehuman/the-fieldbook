# Fieldbook design system

Fieldbook's design system is the shared interface code in `components/` and `styles/`, together with the usage rules in this guide. The installed app and separate interactive demo use that code. The demo-only `/ui` catalog shows representative examples, not a complete component inventory or the source of the components.

Its foundations are shadcn/ui source composition, Radix interaction primitives, Tailwind CSS 4, Geist, Lucide, and semantic theme variables. This guide is for contributors changing the interface.

## Where the interface lives

| Layer | Location | Owns |
| --- | --- | --- |
| Theme | styles/tokens.css | Colors, type, spacing, radii, and page measures |
| Primitives | components/ui/ | Controls, fields, dialogs, menus, cards, tables, and feedback |
| Patterns | components/patterns/ | Repeated page composition and navigation |
| Product components | components/ | Reusable feature UI, such as `CourseCard` and `CurriculumCard` |
| Application layout | styles/layout.css | Shell and feature geometry |
| Reading and artwork | styles/content.css and styles/artwork.css | Authored content and decorative media |

Before building a control, card, or page pattern, check the shared components and the `/ui` examples. Reuse or extend an existing component when it already owns the behavior. For example, `CourseCard` and `CurriculumCard` compose the shared `LearningCard`; the demo and installed Updates pages both use `UpdateCard`.

Put new reusable controls in `components/ui/`, repeated composition in `components/patterns/`, and reusable product UI in `components/`. Keep route-specific data fetching, permissions, mutations, and route destinations in the owning app or demo feature. A one-off layout can stay local; move it into the shared library when reuse warrants it. Do not copy a reusable interface between the installed app and demo or build a second feature-specific control system. Avoid broad overrides and components with options for every possible layout.

## Compose a page

- Use SectionHeader for a section's title, description, and actions. Use CollectionControls or CollectionToolbar for search, sort, filters, and creation actions.
- Use Field, FieldDescription, and FieldGroup for forms. Associate help and errors with controls, mark invalid fields, and keep labels visible.
- Use Button for commands; use an actual link for navigation. Use Tabs for panels, FilterOptions for collection filters, SortPicker for ordering, and DropdownMenu for actions.
- Use DataTable with a declared column schema for application records. Keep horizontal overflow inside TableContainer. Plain tables remain appropriate for authored content.
- Authored tables use GFM Markdown plus an optional versioned width comment at the start of the body. Width entries follow top-level tables in order; tables inside quotes retain automatic sizing without Fieldbook resize or drag handles. Plain Markdown tables without saved widths also retain automatic sizing. Tables keep their natural or saved width instead of stretching to the text width. Wider tables scroll within the writing or reading area, with edge fades where more columns are hidden. Inserted tables, media, images, code blocks, and dividers place their action menu in the left writing gutter; the menu stays outside a table's horizontal scroller. Editor resize tabs use grab and grabbing cursor feedback, and resizing one column preserves the others' widths. Direct expansion stops at 640 pixels; a naturally wider column retains its width when another is resized and can be reduced gradually. Keep table width changes in the content field so draft, publication, and Markdown export carry the same layout.
- Content feedback starts a new entry for each interaction. A thumb saves immediately; its optional comment updates that entry. Successful submission or dismissal resets the form. Administrator feedback deletion uses the shared individual and bulk action controls with permanent-delete confirmation.
- Use shared dialog and picker patterns. Keep search and actions reachable while result lists scroll. Preserve keyboard selection, dismissal, and focus return.
- Use the shared publication, progress, empty, error, loading, and pending-save states. A published item with newer draft edits must show both facts.
- For explicit manual saves, compare the draft with its saved baseline in the owning form and use SaveChangesControl. Keep Save visible but disabled when nothing changed. In settings footers, keep the gray save area compact and place a quiet Discard action just below it when editing begins. Announce unsaved and saving states to assistive technology without adding visible status text; explain any other reason that blocks saving. Guard form submission as well, so pressing Enter cannot save an unchanged draft. Automatic draft saves and publication actions have their own states.

A parent layout owns the space between sections. A field group owns the space between fields. Individual controls should not add compensating margins. Use semantic theme tokens rather than literal interface colors; decorative artwork and validated runtime branding are separate cases. Text must remain readable when it wraps or grows.

## Layout and accessibility

The workspace owns normal page scrolling. Nested lists may scroll when bounded, but short screens and enlarged text must still reach every control. Do not solve a sizing problem with a global overflow lock. Tables and horizontal strips scroll within their own containers without trapping vertical page scroll.

Use semantic elements, accessible names, visible focus, and keyboard-operable controls. Check the states and layouts affected by the change, including empty, loading, error, disabled, selected, long-content, and enlarged-text states where relevant. Review desktop, tablet, and phone layouts when the change can affect them. Exercise affected interactions such as filtering, opening menus, and saving.

## Verify interface work

When adding or changing a shared component, show representative states in the demo's `/ui` catalog using the actual component, and document any non-obvious usage or accessibility rules. The catalog uses synthetic content; it does not supply runtime components to the installed interface.

Run `pnpm check:ui` and relevant browser tests for the changed behavior. Review both apps when shared behavior changes.

Before running demo browser tests, build the demo and install the Playwright browser if needed. Available test commands are in `package.json`. Review the resulting screenshots as well as test output. A local browser check does not prove a hosted installation's authentication or data behavior.

Adapted component-source attribution is in [third-party notices](third-party-notices.md).
