# Fieldbook

A lightweight, opinionated Next.js enablement application organized around **Field Notes**, **Learning**, and **Knowledge**. The repository contains a static interactive demo at the root and a production application in `production/`. They share the UI and content models. The production application requires backend setup and end-to-end deployment verification before use.

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

## Personal production application

Set the hosting project's root directory to `production/` and allow access to the repository's shared files outside that directory. The public demo stays at the repository root, with its own deployment. Read [the production setup guide](production/README.md) before deploying.

The production application adds Google sign-in, optional learner accounts, PostgreSQL persistence through Supabase, branding/access settings, Markdown formatting and preview, private media storage with signed delivery, and OAuth-protected MCP content tools. Production content starts empty. Demo profiles and browser content are not imported automatically.

The first production scope is a public personal Fieldbook. Company groups, team administration, manager permissions, and enterprise identity providers remain demo features pending their production implementation. The production UI hides these controls.

## Verification

`pnpm test` covers the shared learning rules plus production database migrations, draft/published isolation, optimistic revisions, direct table/function access restrictions, progress merging, OAuth audience binding/revocation, payload redaction, safe login redirects, and MCP tool/HTTP transport initialization. `pnpm build` builds the static demo. `pnpm build:production` builds the server application.

Builds and local tests do not establish a working Google login, live storage upload, or ChatGPT/Claude connection. Those require the configured deployment and separate end-to-end verification.

## Publication status

This is an evolving personal project. The public demo and source publication are separate steps. An open-source license and a production-ready release have not yet been selected/published; do not treat this prototype as a secure company deployment.
