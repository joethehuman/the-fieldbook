# Working in The Fieldbook

These instructions apply to coding agents working in this repository. Read [README.md](README.md) for product context and [CONTRIBUTING.md](CONTRIBUTING.md) for the shared contribution standards, development setup, and review expectations. Base decisions on current code and documented behavior; do not require private project notes or conversation history.

## Before editing

Confirm the working directory, branch, existing changes, and requested outcome. Inspect the relevant implementation and nearby tests. Preserve unrelated work and ask only when a material ambiguity cannot be resolved from available evidence.

Use the Node.js and pnpm versions declared in `package.json`. Install dependencies with `pnpm install --frozen-lockfile`. For installed-app work, use a dedicated development backend and the [installation guide](docs/installation.md). Local execution does not imply isolated data: verify the configured target before any operation that changes records or applies SQL.

## Know the repository boundaries

| Location | Purpose |
| --- | --- |
| `app/` and `server/` | Installed Next.js application routes and server services. |
| `demo/` | Separate browser-local demo with fictional identities and data. |
| `components/` and `lib/` | Shared interface, content models, and product rules. |
| `server/ports/` | Provider interfaces and application-level records. |
| `server/providers/` | Provider-specific integrations. |
| `supabase/migrations/` | Ordered database changes for the current supported backend. |

The documented stack is Vercel, hosted Supabase, and Google sign-in. Treat alternative providers as contribution targets until their implementation and installation instructions have been verified.

## Implement through provider interfaces

Follow the portability requirements in [CONTRIBUTING.md](CONTRIBUTING.md#keep-fieldbook-portable). Inspect the relevant interface, its current implementation, and the service entry point before changing an integration:

| Concern | Interface | Service entry point |
| --- | --- | --- |
| Data | `server/ports/data.ts` | `server/data.ts` |
| Identity | `server/ports/identity.ts` | `server/identity.ts` |
| Storage | `server/ports/storage.ts` | `server/storage.ts` |
| Hosting | `server/ports/deployment.ts` | `server/deployment.ts` |
| AI | `server/ports/ai.ts` | `server/ai.ts` |

Keep provider SDK imports, query clients, credentials, and host-specific behavior in adapters and the designated configuration or service entry points. Do not import provider implementations into shared components or feature services to bypass an interface. Inspect adjacent interfaces for media, cleanup, and MCP when the integration affects them.

Preserve application behavior and existing defaults when adding a provider. Extend the relevant interface only for a demonstrated requirement. Wire the new implementation explicitly; do not assume that an environment variable alone makes an unsupported provider available. Keep identity-provider subjects distinct from Fieldbook person identifiers, and preserve saved data and authorization rules.

Run `pnpm check:providers` after changes to provider integrations or boundaries. It checks selected import and credential patterns; it does not prove that an adapter fulfills its contract or that a deployment works.

## Preserve product and security rules

- Published content is available to everyone admitted to an installation. Learning groups guide relevance and course assignments, not access. Teams independently scope manager reporting.
- Preserve overlapping assignment sources, course versions, and saved learner progress. Inspect their current semantics before changing learning behavior.
- Enforce permissions on the server for UI-backed APIs and MCP operations. Client state and hidden controls are not authorization boundaries.
- Keep private media private and server credentials out of browser code. Use synthetic records in tests, examples, logs, and screenshots.
- Keep operator accounts, branding, content, and deployment secrets outside reusable source. For vulnerabilities, follow [SECURITY.md](SECURITY.md).

Add a new migration for schema changes; never rewrite a migration that may already have run. Rehearse changes outside production and document compatibility and deployment order. Treat application deployment and database migration as separate operations.
Keep `node scripts/setup-database.mjs` working for a fresh project when adding migrations. Test both a fresh install from the baseline plus later migrations and an upgrade from the preceding schema. The pre-release files in `supabase/history/initial-development/` are retained for older installations, not applied during a fresh install.

## Verify and explain the change

For interface work, reuse `components/ui/` and `components/patterns/` and follow the [design system](docs/design-system.md). Check both the installed app and demo when shared code changes. Demo results do not prove real authentication, authorization, or persistence.

Choose focused checks from `package.json` using the guidance in CONTRIBUTING.md. Broaden verification for substantial changes or concrete risks. Report exactly what passed, failed, or was not run; distinguish source inspection, local tests, browser checks, and deployed integration checks. Never present a build as proof of live permissions or data preservation.

Handle documentation as part of the change:

1. Update affected existing repository guides and configuration examples in the same contribution. Keep them usable without private project context. Get maintainer agreement before adding another guide; do not create task reports or a separate product documentation library.
2. Include a **Documentation impact** section in the pull request, following the [pull request template](.github/pull_request_template.md) and [CONTRIBUTING.md](CONTRIBUTING.md#submit-a-pull-request). List the repository documentation or configuration examples updated. If the change affects documentation on thefieldbook.org, explain what needs updating and link affected articles when known. If you cannot check the articles, name the topic for maintainer review.
3. Leave updates and publication of documentation on thefieldbook.org to maintainers. They track the work flagged in the pull request and complete it as part of the release. Do not edit or publish content on thefieldbook.org without separate authorization.

Keep public guides free of private plans, task logs, commit-reference disclaimers, or incomplete internal review notes. Describe operator requirements and compatibility limits where they affect the task; keep review evidence in the pull request or task discussion. Do not claim testing or support without evidence.

When preparing a pull request, read and fill the [pull request template](.github/pull_request_template.md). Use its sections, keep detail proportional to the change, and omit the optional compatibility section when it does not apply. Keep the documentation section brief; use "None" when documentation is unaffected. Do not assume that creating a PR through an API or command-line tool fills the template for you. The template is requested rather than mandatory for human contributors; do not reject a human contribution solely for using an equivalent format.

Before pushing, inspect automated build and deployment triggers. Do not merge, deploy, apply database changes, publish content, or change repository visibility without authorization for that action. Finish with a concise explanation of what changed, what was verified, any unresolved limits, and the relevant branch or pull request.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
