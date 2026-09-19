# The Fieldbook

A lightweight, opinionated learning and knowledge management platform built with Next.js.

Fieldbook gives a team three places to work:

- **Field Notes:** timely updates, launch briefs, and newsletters.
- **Learning:** short courses with text, video, quizzes, and progress.
- **Knowledge:** evergreen articles organized in a nested navigation tree.

The aim is a small, useful home for enablement—not a hosted multi-company SaaS service. Each operator deploys their own instance and owns its content, accounts, and infrastructure.

> Pre-release: this repository is being prepared for open-source publication. No open-source license has been selected yet. Public release and licensing are separate from running the demo or a personal instance.

## One repository, two applications

| | Interactive demo | Working instance |
|---|---|---|
| Deployment root | Repository root | `production/` |
| Data | Sample content in browser storage | Your Supabase database and storage |
| Accounts | Simulated profiles, no security boundary | Google sign-in; server-enforced permissions |
| Purpose | Try the UI, including administration | Publish your content and save learner progress |
| MCP | Not available | Authenticated endpoint on your own instance |

**Importing the repository with the default root deploys the demo.** To deploy the working application, select `production/` and configure the services in the [setup guide](production/README.md). Deploying code does not automatically provision a database or configure Google sign-in.

You can deploy both from this repository as separate hosting projects. Their data is independent. A company can use the same code with its own configuration or fork it for code changes; normal branding and content edits belong in its instance settings, not a fork.

## Start here

- [Deploy a working instance: database, storage, Google sign-in](production/README.md)
- [Connect ChatGPT or Claude through MCP](docs/mcp-setup.md)
- [Choose or change your domain](docs/domains.md)
- [Write your installation's privacy policy](docs/privacy-setup.md)
- [Optional AI content-authoring guide](docs/ai-authoring.md)
- [Contributing and development](CONTRIBUTING.md)
- [Before the first public release](docs/release-checklist.md)

## Try the demo locally

Use Node.js 22.x and pnpm 10.17.1:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the address shown in the terminal. Choose a sample profile in the sidebar to explore the learner, administrator, and manager views. Data stays in that browser and origin. Do not enter private data: demo role switching is a simulation.

```sh
pnpm test
pnpm build
pnpm start
```

The demo exports static files to `out/`. On Vercel use the repository root and Next.js preset; on a static host build with `pnpm build` and publish `out/`. A DigitalOcean deployment must use a Static Site component, not a server application. Check each host's current plan and transfer limits; free hosting is not a universal spending guarantee.

## What works today

The working instance supports public or members-only browsing, optional Google accounts, persistent progress, feedback, draft/published content, Markdown formatting and preview, image/video uploads, branding and privacy settings, and administrator-only MCP tools. Content starts empty. No separate CMS is required.

The demo also previews assignment groups, nested teams, and manager reports. **Those administration features are not enabled in production yet.** See [learning rules](docs/learning-model.md). Enterprise SSO/Okta, Glean, dedicated search, video transcoding, and hosted SaaS tenancy are not implemented.

The frontend is Next.js; the current backend depends on **Supabase Auth, PostgreSQL and Storage**. Vercel is the documented deployment path. Other hosts need a compatible Next.js server runtime and their own deployment verification; this is not yet a tested deploy-anywhere package.

## Repository map

- `app/`: browser-local demo routes
- `components/`, `lib/`: shared UI and models
- `production/`: server application, authorization, APIs, MCP
- `supabase/migrations/`: database and media-bucket setup
- `tests/`, `production/tests/`: behavior and server checks
- `docs/`: operator and contributor guides

## License and support

A license will be selected before source release; the absence of one does not grant open-source reuse rights. There is no support SLA. Before inviting real learners, complete the deployment verification and backup checklist in the setup guide. Report reproducible bugs through this repository's issues when available, without credentials or personal learner data.
