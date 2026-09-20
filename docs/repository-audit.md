# Repository foundation audit

Reviewed 2026-09-19 against commit `7202aa4e898f0ccf720463d0ccab75c042704f7c`, with the documentation cleanup in the same change. This is a source/configuration audit, not a penetration test or certification of every external integration.

## Findings

| Area | What exists | Evidence / consequence |
|---|---|---|
| Two applications | Root demo and `production/` server app share components | Default root deploys a simulated, browser-local demo. Production installation must select `production/`. |
| Backend | Supabase database API, Auth, Storage, and OAuth | `production/lib/db.ts`, `auth.ts`, upload routes, and migrations use Supabase-specific interfaces. Plain PostgreSQL is not interchangeable. |
| Hosting | Vercel is the documented installation | The progress rate-limit route uses a Vercel forwarding header for guests; other hosts need review, not just a hosting badge. |
| Accounts | Google sign-in; configured owner bootstraps admin, others become learners | `production/lib/auth.ts`. No production people/group/team management API exists. |
| Groups and teams | Models and demo controls exist; production controls are hidden and persistence rejects those changes | `components/Admin.tsx`, `production/app/ProductionApp.tsx`. Do not advertise role assignment workflows or manager administration as production-ready. |
| Content | Draft/published snapshots, revision checks, transactional audit writes | `production/lib/content.ts` and first migration. Unpublishing retains data; this is not a general deletion/retention system. |
| Learning | Server grading, account progress, browser guest progress and import | `production/lib/progress.ts`, `ProductionApp.tsx`, tests. A changed course version can require new completion. |
| Media | Private bucket, signed upload/read URLs, 50 MB ceiling | Upload/media routes. No transcoding or automatic cleanup/retention workflow. Recognized YouTube/Vimeo URL parsing also exists in shared code; this is not a managed provider integration. |
| Search/reports | Bounded queries and in-memory filtering | Snapshot and reports use database response limits (normally 1,000 rows); MCP search scans 500 newest items and returns 50 matches; media listing returns 100. Counts can be incomplete beyond these bounds. |
| MCP | Server included in the Next.js deployment; OAuth, active admin and grant required | MCP and consent routes, token hook migration. ChatGPT exercised in the maintainer installation; Claude remains unverified. No separate skill/server repository is necessary. |
| Instance settings | Branding, public/private browsing, registration, privacy | Settings route/schema. Navigation labels are fixed; settings are not comprehensive UI customization. |
| Releases | No published GitHub releases at audit time | Package and MCP `0.1.0` strings are placeholders. Added release and upgrade guides; no tag/release created. |

## Removed or corrected

- Removed `.do/app.yaml`: an obsolete DigitalOcean static-site manifest hardcoded to the maintainer repository's `main` branch. This does not delete any external DigitalOcean resource.
- Removed DigitalOcean deployment guidance from the README. The supported path is Vercel + hosted Supabase + Google sign-in.
- Removed future implementation promises and an outdated personal-domain migration task from the generic release checklist.
- Added `artifacts/` to `.gitignore` so local deployment notes and policy drafts stay outside source releases.
- Replaced ambiguous deployment/version wording with explicit release selection, database migration, and operator-controlled upgrade instructions.

## Retained intentionally

- Demo, seed data, group/team models and tests: used by the interactive demo and shared UI. Removing them would remove an existing deliverable and break imports.
- Both package manifests and Next.js configurations: there are two build roots. `private: true` prevents accidental npm publication; it does not determine GitHub visibility or licensing.
- Historical migrations: required for fresh installations and upgrade history; do not rewrite already-applied SQL as cleanup.
- Current pnpm workspace/lockfile and CI configuration: pinned install/build checks remain useful. No speculative infrastructure or release automation added.

## Verification and release gates

The local files matched GitHub's reviewed tree before editing. Existing tests passed: 15 shared/database checks and 4 server/MCP checks. The local test runtime was Node 24.19.0 / pnpm 11.25.0, while the supported project and CI target is Node 22.x / pnpm 10.17.1. This is not a claim that the pinned-runtime CI or a fresh installation passed during this audit.

Documentation links and changed files were checked separately. No production behavior or schema was changed in this cleanup.

Before publication, complete the [first-release checklist](release-checklist.md), especially:

- Merge/reconcile the intended implementation into the default branch. At audit time, production work was on `fieldbook-personal-production`; its draft PR targeted `fieldbook-demo-expansion`, not `main`. Neither branch name represents a published version.
- Choose a license, review dependency/asset licenses, and establish an actual private security-reporting channel.
- Audit Git history as well as current files for credentials and personal data. This audit does not certify the entire historical repository as safe to publish.
- Rehearse a clean Vercel/Supabase installation and test separate learner permissions, cross-device progress, guest import, media access, MCP expiry/revocation, and database/media recovery.

These are release gates, not promised product features or a roadmap.

## Consolidation follow-up

The complete audited implementation and documentation were merged into `main` through PR #2; PR #1 was also recorded as merged because its commits are included. Both former development branch tips are ancestors of main. Vercel demo and production now track main, retaining separate build roots and backend configuration. The repository remains private and no version release was created. The source commit passed the configured GitHub CI checks before merge. The remaining license, security-history review, fresh-install, and external validation gates still apply.
