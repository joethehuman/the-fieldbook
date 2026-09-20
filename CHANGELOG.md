# Changelog

No versions have been released. Package and MCP version strings do not constitute a GitHub Release. See the [release process](docs/releases.md).

## Unreleased

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
