# The Fieldbook

The Fieldbook is a source-available learning and knowledge platform for teams that want to run their own installation. It gives each kind of content a job: **Updates** share news and perspective, **Courses** teach through lessons and knowledge checks, and **Docs** hold maintained reference material. Authors work in the built-in admin interface; readers use the same site.

The documented installation uses **Vercel, hosted Supabase, and Google sign-in**. Each operator supplies and controls their own accounts, data, media, domain, and content. The optional interactive demo uses fictional data stored in the browser; it does not create a working installation or persist learner records on a server.

## Start here

- [Install Fieldbook](docs/installation.md) from your own accounts. The guide covers database migrations, hosting, sign-in, media, and first-use checks.
- [Upgrade an installation](docs/upgrading.md) with separate database and media backups, a migration record, and an isolated rehearsal.
- [Contribute](CONTRIBUTING.md) or read the [agent instructions](AGENTS.md) and [design system](docs/design-system.md) before changing the software.
- Read the [license](LICENSE), [third-party notices](docs/third-party-notices.md), and [security reporting instructions](SECURITY.md).

The installation is a Next.js application backed by Supabase Database, Auth, and private Storage. Google accounts sign in through Supabase Auth. Administrators can create and publish content, manage people and assignments, and review feedback and progress. Published content is available to everyone admitted to an installation; learning groups guide relevance and assignments rather than content access. Teams separately scope manager reporting.

Search is built in. Learner Ask AI and the authenticated administrator MCP endpoint are optional; each requires its own configuration. The demo can illustrate the interface, but its simulated identities and data must not be used to judge production permissions or persistence.

## Run locally

Use Node.js 22.x and pnpm 10.17.1. Configure a separate development Supabase project in a root .env.local file before starting the installed application. Never use production credentials for local development.

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

Run the browser-local demo with pnpm dev:demo. The shared interface catalog is at /ui in the demo. The installed app lives at the repository root; demo/ is a separate optional app. Shared components and models live in components/ and lib/, server behavior in app/ and server/, and database migrations in supabase/migrations/.

Fieldbook is available under the [Elastic License 2.0](LICENSE), which allows many internal uses but restricts offering the software's substantial functionality as a hosted or managed service. Review the license itself before relying on a particular use. There is no support SLA or promised release schedule.
