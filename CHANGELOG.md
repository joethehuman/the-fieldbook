# Changelog

No versions have been released. Package and MCP version strings do not constitute a GitHub Release. See the [release process](docs/releases.md).

## Unreleased

- Give sign-in a compact, responsive layout with separated secondary links. Keep return destinations in a short-lived cookie so the sign-in address stays clean.

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
