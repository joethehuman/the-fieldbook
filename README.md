# Fieldbook

A Next.js field enablement prototype: knowledge library, field notes, and lightweight learning. Built for DigitalOcean App Platform's free static-site tier.

## Run locally

Use Node.js 22+ and pnpm 10+:

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm start
```

`build` exports the site to `out/`. `start` serves that export. There is no server or database in this demo.

## Try it

The site opens directly to Learning as a sample account executive. Click the profile at the bottom of the sidebar to switch to the workspace admin or another sample role. No registration or password is required.

- Learning: role-based For you assignments, a currentness ring, topic channels, text/video lessons, quizzes, and saved progress.
- Knowledge: categorized articles, folder navigation, Markdown reading, and search.
- Field notes: briefs and newsletters in a chronological feed.
- Manage workspace (admin demo profile): create/edit/publish content, build courses and quizzes, create sample profiles and groups, make group assignments, inspect progress.
- New course versions can require learners to complete the revised content again.
- About this demo: export local workspace data or reset sample content.

All content and progress are stored in localStorage on the current origin and browser. The selected demo profile is in sessionStorage. Nothing is synchronized between visitors. Profile roles are a UI simulation, not an authorization boundary. Do not enter sensitive data.

Video lessons accept existing HTTPS MP4/WebM URLs, including DigitalOcean Spaces URLs. This prototype does not upload files or provision Spaces. The initial sample courses contain text lessons; video playback can be exercised by adding a public sample video URL in the editor.

## DigitalOcean deployment

Create a static site in the existing `first-project` (ID `6b7fb358-6c1a-4d5b-bc2b-a99718537543`). Connect this repository, select `main`, set the component type to **Static Site**, build command `pnpm build`, and output directory `out`. Review that the monthly component estimate is **$0**. Do not add a web service, database, or Spaces subscription for this demo. `.do/app.yaml` documents the app configuration.

The free tier includes three static-site apps and 1 GiB/month transfer per app; overages can be billed under DigitalOcean's terms. Account activation and GitHub connection may still be required by DigitalOcean. See https://www.digitalocean.com/pricing/app-platform.

## Future shared version and MCP

The content model uses stable IDs, content kinds, versioned courses, group assignments, and separate learner records. `lib/store.ts` is the persistence boundary; replace it with authenticated API calls for shared use. Keep the UI and model intact while moving records to DigitalOcean PostgreSQL and media to Spaces.

Add server-side authentication and authorization before using real users or private content. Grade quizzes on the server and store completion against course versions. A future MCP server should call the same authorized content service, supporting draft creation, content updates, and explicit publishing with audit records. Do not expose browser-local demo storage as an MCP backend.
