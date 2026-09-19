# Fieldbook

A lightweight, opinionated Next.js enablement application organized around **Field Notes**, **Learning**, and **Knowledge**. This repository currently delivers the interactive demo; the authenticated production backend is planned, not implemented.

## Run the demo

Use Node.js 22+ and pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm start
```

`build` exports the site to `out/`. There are no server functions, database connections, analytics, or paid integrations in this build. Demo data lives in localStorage on the current browser and origin; profile selection lives in sessionStorage. Changing domains creates a separate demo. Existing browser data is preserved across these updates.

## Explore

- **Learning:** horizontally scrolling assignments and topic channels; currentness ring; course filtering; sorting by deadline, assignment, addition, update, or title; all-assignment and completed-course views.
- **Knowledge:** Markdown articles with nested folder navigation.
- **Field Notes:** chronological updates and briefs.
- **Feedback:** one editable rating per person/content item, optional comment, admin sentiment summary and item-level filtering. Submitting a new rating records the current content version.
- **Manage workspace:** content search/type/topic filters, profile search/role/group/status filters, course builder, group-specific assignment deadlines, nested groups, nested teams, and progress reports.
- **My team's progress:** team managers see their teams and descendants, aggregate currentness, and individual assignments. Assignment groups and reporting teams are independent.
- **Video:** YouTube and Vimeo embeds, or direct HTTPS MP4/WebM files. Hosting, captions, privacy, and embed availability are controlled by the video provider. Watching a video does not automatically mark a lesson complete.

Switch profiles using the sidebar footer. Fresh demos include a learner, solutions engineer, administrator, and manager. Existing saved demos retain their own profiles and can add managers/teams in administration. All published content remains visible to everyone. The demo's role controls are UI simulations, **not a security boundary**; do not enter private data.

## Assignment rules

- Users may join multiple groups. Membership includes ancestors; parent assignments apply to nested group members.
- Each course appears once even when multiple group assignments apply.
- Each group assignment supports no deadline, a calendar date, or a positive number of days after assignment.
- Relative deadlines start at the later of assignment creation and the user's recorded group join date. When multiple memberships qualify, the earliest qualifying membership applies. Calendar calculations use UTC dates.
- Overlapping deadlines resolve to the earliest deadline. No-deadline assignments do not cancel another deadline.
- Legacy demo records lack historical assignment/membership timestamps: the original content timestamp is used as the baseline. Moving a group under a parent immediately inherits that parent's existing assignment rules. Production will materialize assignment events rather than infer historical enrollment.
- Currentness counts all currently published assigned courses, including ones due later. Publishing a new course version requires fresh completion.
- Reviewing/retaking does not erase a previous pass. Attempts are recorded against a course version; failed retakes preserve completion.
- The demo records one reporting team per user, with a manager on each team. A manager can oversee multiple teams. Cyclic hierarchy choices are prevented.

## Free static hosting

### Vercel

Import this repository as a Next.js project. Use `pnpm build`; Next.js static export produces `out/`. No environment variables or integrations are required. For a personal noncommercial demo, use a Hobby account. Confirm the selected account/plan before deploying. The public demo is not a company production installation.

### DigitalOcean

Use a **Static Site** component with `pnpm build` and output directory `out`. Do not provision a web service, database, or Spaces for demo mode. The existing `.do/app.yaml` is the original configuration. DigitalOcean's static allowance can incur transfer overages; a displayed $0 base price is not a spending cap.

### Netlify or another static host

Build with `pnpm build` and publish `out`. Navigation uses URL fragments, so no server route rewrites are needed.

## One codebase, future production mode

UI components consume the shared models in `lib/types.ts`. `lib/store.ts` is the current browser persistence implementation. The planned production implementation should reuse those models and UI behind authenticated services, while keeping demo seeds/storage out of production bundles.

Production work still required:

- Running Next.js backend, PostgreSQL schema/migrations, and server-validated content/progress operations.
- Configurable Google/OIDC sign-in (including compatible Okta/Entra providers); optionally email/password. Controlled enrollment and server-enforced permissions.
- Server-side quiz grading; materialized enrollment dates, assignment history, and team reporting authorization.
- PostgreSQL full-text search, private object storage, email delivery, backups, monitoring, audit records, and separated preview data.
- Production deployment guides and integration tests for each supported host.

A future MCP adapter should invoke the same authorized content services, not browser storage. HRIS sync, AI chat, and ordered learning paths are deferred.

## Verification

`pnpm test` covers completion/versioning, progress isolation, nested group assignments, deadline resolution, manager scope, cycle prevention, retake history, and video URL validation. `pnpm build` checks types and produces the static artifact.

## Publication status

This is an evolving personal project. The public demo and source publication are separate steps. An open-source license and a production-ready release have not yet been selected/published; do not treat this prototype as a secure company deployment.
