# UI redesign review

Branch: `feature/ui-redesign`, based on `main` at `53ec70fb7ddcee2faeaa9b15c7b9855679eff813`.

## Design direction

A light, neutral workspace with Geist typography, consistent spacing, compact controls, quiet borders, and one installation-specific accent for branding and links. Primary actions use a high-contrast neutral treatment. The demo and production app share the same theme and components.

Administration is organized into Publishing (Content, Feedback), People & learning (People, Groups, Required learning, Teams, Progress), and Workspace (Settings). Settings have separate Identity, Learning, Access, Privacy, and production-only Connections sections. All existing settings remain available.

The learning summary is a compact status row. An empty assignment list explains that no courses are required instead of displaying 100% completion. Group-specific course rows remain available under an expandable section so the same courses do not fill the page twice by default.

## Implementation

- `app/design-system.css` defines the shared theme, component styles, responsive layout, and focus treatment. `app/globals.css` retains specialized content and artwork rules and uses shared tokens for foundational surfaces.
- `components/ui/` follows shadcn/ui's owned-component composition using Radix Select, DropdownMenu, Tabs, Dialog, and AlertDialog, plus a variant-based Button. Styles use the existing CSS stack rather than introducing Tailwind alongside it.
- `SelectField` adapts the existing declarative option lists to the Select primitive, preserving empty values, dynamic options, disabled controls, and value callbacks.
- Browser confirmation and rename prompts use shared accessible dialogs. Profile and demo dialogs use Radix focus management.
- Geist is bundled through `next/font/local` via the Geist package; there is no browser-time Google Fonts stylesheet request.
- Shared UI dependencies are declared in both application manifests.

The redesign preserves the existing content, learning, reporting, settings, and persistence handlers. It introduces no API, authorization, model, or database migration changes. Feature preservation is an implementation constraint, not a claim of completed regression testing.

## Review status

Source review covered the learner, manager/reporting, administrator, editor, feedback, and production account surfaces. A local demo layout pass covered the learner view, administration, required-learning controls and dropdown, settings, and the shared reporting component. This used synthetic demo data, including a narrow layout and a desktop layout.

Per the task's explicit direction, no test suite, type-check command, production build, or end-to-end regression suite was run. Production authentication, saving, publication, and server behavior have not been exercised for this redesign. Review those before merging. No production database or live installation was changed by this task.

## Review locally

Run `pnpm install --frozen-lockfile` and `pnpm dev`. Use the demo profile switcher at the bottom of the sidebar to explore learner, administrator, and manager profiles. The demo keeps its own browser-local sample data; production remains a separate installation.

Useful review areas:

- Learning summary, course library, course/quiz pages, knowledge articles, and Field Notes.
- Administration → Groups: compact management action and overflow menu.
- Administration → Required learning: aligned course picker/action and clearly separated search/table.
- Administration → Settings: grouped options, one settings save flow, and separate policy publication.
- Progress and manager reporting: filters, summary, people table, and course details.

Design references: [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines), [shadcn/ui Select](https://ui.shadcn.com/docs/components/radix/select), and [Next.js fonts](https://nextjs.org/docs/app/getting-started/fonts).
