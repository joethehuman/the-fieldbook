# The Fieldbook

The Fieldbook is a source-available learning and knowledge platform for teams that want to run their own installation. It gives each kind of content a job: **Updates** share news and perspective, **Courses** teach through lessons and knowledge checks, and **Docs** hold maintained reference material. Authors work in the built-in admin interface; readers use the same site.

The supported [installation recipes](docs/installation.md) are **Vercel with hosted Supabase** and **DigitalOcean App Platform with Managed PostgreSQL, self-hosted Supabase Auth/REST/Storage and private Spaces**. Both use Google sign-in. Optional Ask AI can use Vercel AI Gateway or a configured DigitalOcean Inference Router independently of hosting. Each operator supplies and controls their own accounts, data, media, domain, and content. The optional interactive demo uses fictional data stored in the browser; it does not create a working installation or persist learner records on a server.

## Start here

- Choose an [installation recipe](docs/installation.md): [Vercel with hosted Supabase](docs/installation.md#vercel-with-hosted-supabase) or [DigitalOcean App Platform](docs/installation.md#digitalocean-app-platform).
- [Update and maintain an installation](docs/upgrading.md), including Fieldbook migrations, backend component updates, cleanup and recovery.
- [Contribute](CONTRIBUTING.md) or read the [agent instructions](AGENTS.md) and [design system](docs/design-system.md) before changing the software.
- Read the [license](LICENSE), [third-party notices](docs/third-party-notices.md), and [security reporting instructions](SECURITY.md).

The installation is a Next.js application backed by Supabase Database, Auth, and private Storage. Google accounts sign in through Supabase Auth. Administrators can create and publish content, manage people and assignments, and review feedback and progress. Published content is available to everyone admitted to an installation; learning groups guide relevance and assignments rather than content access. Teams separately scope manager reporting. Fieldbook is developed with AI-assisted coding.

Reader and named Admin record links include a readable title followed by the complete record ID. IDs remain stable, so existing links and links with older titles still work after a rename. Admin content types and page tabs have bookmarkable destinations that survive refresh and browser Back/Forward.

Organization Settings → Categories manages separate Course and Update category lists, including empty categories. Administrators can rename categories, move selected or all content, and permanently remove a category after its items have moved elsewhere. Moves update category labels in drafts and published copies while preserving other edits and learning history. Course category order controls the Courses homepage; Curricula remain at the bottom. Update category order does not change the feed. Category management uses the existing database and requires no migration.

Organization Settings → Docs navigation lets administrators arrange direct Docs and subsections in any order within a section. Drag items, use the handle’s arrow keys, or choose Move up/down from Actions, then save settings. The reader sidebar and Previous/Next links follow the same order. Existing navigation retains its order until edited.

Contributors place content in existing Docs sections or subsections and Course or Update categories. Only administrators create, rename, delete, or reorder those structures. Contributors can save unfinished drafts while waiting for an administrator to create a destination; publishing requires a valid section or category. The same permissions apply through the editor, API, and MCP.

Search is built in. Installed reader search favors titles and lesson headings, supports partial words, common English word forms and basic typos, including swapped adjacent letters. Literal matching remains available for technical terms and other languages. Admin lists and assignment pickers search titles or names, with email matching for people; matching ignores case and surrounding spaces. Hierarchy choosers also match parent paths. Feedback and review screens can search their visible comments or details. Ask AI and the authenticated MCP endpoint are optional. MCP access follows the account's publishing or reporting permissions and the connection's approved capabilities. The demo can illustrate the interface, but its simulated identities and data do not establish installed permissions or persistence.

On public installations, guest course progress stays in that browser. After sign-in, Fieldbook quietly saves compatible progress to the account and disregards invalid records, unavailable courses and older course versions. Temporary connection or service failures leave browser records available for a later attempt. This does not interrupt sign-in or show an import prompt.

## Local development (optional)

Use Node.js 22.x and pnpm 10.17.1. Configure a separate development Supabase project in a root .env.local file before starting the installed application. Never use production credentials for local development.

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

Run the browser-local demo with pnpm dev:demo. The shared interface catalog is at /ui in the demo. The installed app lives at the repository root; demo/ is a separate optional app. Shared components and models live in components/ and lib/, server behavior in app/ and server/, and database migrations in supabase/migrations/.

Each visit refreshes original sample learning dates relative to today, keeping upcoming and overdue examples available. Edited schedules and visitor progress stay saved in the browser. Course cards and deadline rules use the same shared code as the installed app.

The demo searches published sample content and lesson text locally. Title and lesson-title matches take priority while typing, and search accepts basic typos.

## License

Copyright (c) 2026 Joseph DeSapio. All rights reserved.

Fieldbook is available under the [Elastic License 2.0](LICENSE), which allows many internal uses but restricts offering the software's substantial functionality as a hosted or managed service. Review the license itself before relying on a particular use. There is no support SLA or promised release schedule.
