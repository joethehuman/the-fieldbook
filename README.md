# The Fieldbook

A lightweight, opinionated learning and knowledge management platform built with Next.js. Source available under the [Elastic License 2.0 (ELv2)](LICENSE).

Fieldbook brings three kinds of content together:

- **Updates:** updates, launch briefs, and newsletters.
- **Courses:** courses with text, video, quizzes, and saved progress.
- **Docs:** evergreen articles organized in a nested knowledge base.

Run your own installation, maintain content in the built-in admin panel, and optionally connect an AI client to edit content through MCP. Each installation has its own accounts, data, domain, and configuration. No separate CMS is required.

> **Before the first release:** this project is still being prepared for publication. The code is licensed under ELv2; the repository remains private while the first public release is prepared. There are no published releases. The `0.1.0` values in the code are development placeholders, not a released version. Do not treat the current branch as a stable release.

## Supported setup

The documented production setup is **Vercel + hosted Supabase + Google sign-in**.

| Component | What you supply |
|---|---|
| Code and hosting | Your GitHub repository and Vercel project |
| Database | A dedicated Supabase PostgreSQL database |
| Learner sign-in | Supabase Auth with your Google OAuth web client |
| Images and video files | Supabase Storage; a private bucket created by the migrations |
| AI content management (optional) | Supabase OAuth server and a registered MCP client; ChatGPT has been exercised end to end |
| Domain (optional) | Your custom domain, or one canonical Vercel address |

**Can I use another host or service?** Hosting, persistence, identity and private media have explicit service boundaries, currently implemented for Vercel and Supabase. Contributors can add a host recipe while retaining Supabase and Google, or implement a backing-service adapter with its required schema/setup work. PostgreSQL is required; a plain database, Neon or another identity/storage provider is not a drop-in replacement. Other hosts and self-hosted Supabase have no verified installation recipe yet. See [hosting and service providers](docs/providers.md), including full-stack fresh-install contribution requirements.

Provider accounts, quotas, pricing, and backups are the operator's responsibility. Free plans are not an application guarantee of free operation. There is no support SLA or commitment to additional providers.

## Deploy your own instance

1. Obtain your own copy of the code. Once releases exist, start from a named release and keep a separate `production` branch in your repository; see [versions and upgrades](docs/upgrading.md).
2. Create your Supabase project and apply every included migration in filename order. The recovery migrations also install the deletion worker's hourly schedule.
3. Import **your repository** into Vercel with **Root Directory = repository root** (leave the field empty).
4. Configure the required application and build-identity environment variables, Google sign-in, and matching domain/callback URLs.
5. Set the deletion worker's endpoint to this deployed installation and verify its first request; this is required for 30-day permanent deletion.
6. Sign in as your configured administrator, create content, and complete the deployment checks.
7. Optionally connect ChatGPT to your instance's `/api/mcp` endpoint.

**Follow the [complete installation guide](docs/installation.md).** A GitHub fork or Vercel deployment does not create your database or configure authentication automatically.

## Demo versus a working installation

| | Interactive demo | Production application |
|---|---|---|
| Vercel Root Directory | `demo` | Repository root (empty field) |
| Data | Sample content in browser storage | Your Supabase project; starts empty |
| Identity | Simulated profiles | Google accounts and server-enforced permissions |
| Purpose | Explore the UI, including demo-only features | Publish content and save learner progress |
| MCP | None | Authenticated endpoint on your instance |

**The default repository-root deployment is the installed application.** The optional `demo/` deployment uses synthetic browser-local data; never enter private information in it. Demo and production may be deployed as separate Vercel projects; you do not need to deploy the demo to run your own instance.

## Current capabilities and boundaries

The production application includes:

- Public or members-only browsing and optional learner registration with Google.
- Docs, Updates and Courses with visual Markdown editing, automatic draft saving, explicit publication and draft preview.
- Drafts, explicit publication, revision checks, and content-write audit records.
- Images and video-file uploads, with a 50 MB per-file ceiling and no transcoding.
- Persistent learner progress, server-graded quizzes, and optional browser-progress import.
- Feedback from signed-in members and public visitors, administrator progress/feedback views, branding, and privacy-policy settings.
- Administrator-only MCP tools for content, aggregate reports, and existing media references.

**Production governance** includes people administration, pre-registered Google accounts, learning groups with live team links, reusable curricula, onboarding/catch-up windows, nested reporting teams and server-scoped manager reporting. See [roles and permissions](docs/permissions.md). Navigation labels are currently fixed. Published search uses PostgreSQL indexes across the full published library and returns the best 30 content matches, including lesson destinations. See [search behavior and setup](docs/search.md). Catalog, feedback and aggregate reporting reads paginate past the database API response cap and fail if a page cannot be retrieved. MCP search still scans up to 500 recent items and returns at most 50 matches. Those administrator MCP search bounds can omit matches on larger installations.

## Documentation

- [Install on Vercel and Supabase](docs/installation.md)
- [Hosting recipes and service providers](docs/providers.md)
- [Connect your own MCP client](docs/mcp-setup.md)
- [Configure or change your domain](docs/domains.md)
- [Set up published-content search](docs/search.md)
- [Configure installation and account branding](docs/branding.md)
- [Configure your privacy policy](docs/privacy-setup.md)
- [Select a version and upgrade](docs/upgrading.md)
- [Maintainer release process](docs/releases.md)
- [Learning model](docs/learning-model.md), [groups and curricula](docs/learning-groups.md), and [course browsing](docs/learning-browser.md)
- [Optional guest recommendations](docs/guest-recommendations.md)
- [Reports and CSV exports](docs/reporting.md)
- [Roles and permissions](docs/permissions.md)
- [Server-rendered reading pages, metadata and caching](docs/reading-pages.md)
- [Writing Docs and Updates](docs/authoring.md)
- [Content presentation controls](docs/content-presentation.md)
- [Interface standards](docs/design-system.md) and [agent contribution instructions](AGENTS.md)
- [Changelog](CHANGELOG.md)
- [Contributing and local development](CONTRIBUTING.md)
- [Optional AI authoring instructions](docs/ai-authoring.md)

## Run locally

Use Node.js **22.x** and pnpm **10.17.1**:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

This starts the installed application. Configure root `.env.local` with a separate development backend first. Run `pnpm dev:demo` for the browser-local demo; `pnpm dev:production` remains an alias for `pnpm dev`. See the installation guide for local Google callbacks.

```sh
pnpm test
pnpm build
pnpm build:demo
```

For interface changes, also run `pnpm check:ui` and `pnpm test:ui` after installing Playwright Chromium. The demo component catalog is at `/ui`. See [CONTRIBUTING.md](CONTRIBUTING.md) for development rules and [interface standards](docs/design-system.md) for browser setup and screenshot review.

## Repository layout

- `app/`, `proxy.ts`, `server/`: installed Next.js app, authorization, APIs, and MCP
- `demo/`: static, browser-local demo
- `components/`, `lib/`: shared interface and learning models
- `supabase/migrations/`: database and storage setup
- `server/ports/`, `server/providers/`: service contracts and current implementations
- `deployment/`: hosting recipes and contributor configuration
- `tests/`, `tests/server/`: behavior and server checks
- `docs/`: installation, operation, and release guides

## Project status and license

Fieldbook is source available under the [Elastic License 2.0 (ELv2)](LICENSE). You may use, modify and redistribute the software subject to its terms, including for your own internal installation. ELv2 restricts providing substantial Fieldbook functionality to others as a hosted or managed service, circumventing license-key functionality, and removing or obscuring license, copyright or other notices. See [licensing](docs/licensing.md) for scope and third-party notices.

This is a small independent project. Bug reports should include the version and reproduction steps, without credentials or learner data. A private vulnerability-reporting channel must be established before release. There is no promised release schedule, long-term-support branch, or feature roadmap.
