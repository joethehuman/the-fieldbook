# Contributing to The Fieldbook

The Fieldbook is a lightweight, opinionated learning and knowledge platform. Contributions should help teams learn, author content, or operate their own installation without adding unnecessary complexity. The same contribution standards apply whether you write the change yourself or work with a coding agent.

Fieldbook is source-available under the [Elastic License 2.0 (ELv2)](LICENSE). Contribute only material you have the right to license under those terms, and preserve the [third-party notices](docs/third-party-notices.md).

## Start with the problem

Describe the problem, who encounters it, and the behavior you want to improve. For a defect, include reproduction steps, expected and actual results, and relevant environment details. Use synthetic examples and remove personal information from logs and screenshots.

Keep changes focused. Discuss substantial product, architecture, or provider changes with maintainers before implementing them so you can agree on scope and compatibility. Favor practical improvements to Fieldbook's existing structure over broad feature sets or abstractions for hypothetical integrations.

If you use a coding agent, have it read [AGENTS.md](AGENTS.md) before working. You remain responsible for understanding and reviewing the submitted change, including its dependencies, licensing, and verification.

## Set up for development

Use Node.js 22.x and pnpm 10.17.1. From the repository root, install the locked dependencies:

~~~sh
pnpm install --frozen-lockfile
~~~

For the installed app, copy `.env.example` to a root `.env.local`, configure a dedicated development backend, and follow the [installation guide](docs/installation.md) for database setup and sign-in callbacks. Then run:

~~~sh
pnpm dev
~~~

Never connect development or tests to a production backend. Keep `.env.local`, credentials, personal records, and installation-specific content out of commits.

For interface work without a backend, run the separate browser-local demo:

~~~sh
pnpm dev:demo
~~~

The demo uses fictional identities and data. It is useful for interface work, but cannot establish that real sign-in, permissions, or persistence work. Follow the [design system](docs/design-system.md), reuse shared controls, and check both apps when changing shared code.

## Keep Fieldbook portable

Portability is a project goal. The documented installation uses Next.js on Vercel, hosted Supabase, and Google sign-in; that is the first supported stack, not a requirement that future integrations use those providers. Alternative configurations need an implementation, repeatable instructions, and direct verification before being described as supported.

The code separates application behavior from provider integrations:

| Location | Responsibility |
| --- | --- |
| `components/` and `lib/` | Shared interface, content models, and product rules. |
| `app/` and `server/` | Installed-app routes and services. |
| `server/ports/` | Interfaces defining the operations Fieldbook needs from providers. |
| `server/providers/` | Provider-specific implementations, also called adapters. |
| Service entry points such as `server/data.ts` and `server/deployment.ts` | Select and connect implementations to application services. |

Keep provider SDKs, query syntax, credentials, and host-specific behavior inside the appropriate adapter or configuration boundary. Application features must use the service interfaces rather than bypassing them. Extend an interface when a real requirement calls for it; do not build a speculative framework for every possible provider. Several current services select one implementation directly, so a new provider may also require changes to how it is selected and configured.

### Contribute a provider integration

A useful integration lets another operator run the same Fieldbook product on that provider without maintaining a separate product fork.

1. **Define what changes.** State whether the contribution replaces hosting, data, identity, storage, or AI, and which existing integrations it retains. A hosting contribution does not need to replace the database or sign-in provider.
2. **Implement the integration at the existing boundaries.** Preserve shared product behavior and current installation defaults. Make provider selection and required configuration explicit; keep operator accounts and secrets outside the source.
3. **Verify the affected flows.** For hosting, check application startup, sign-in callbacks, trusted origins, private media, and scheduled work, plus AI or MCP paths affected by the change. For data or identity changes, also check access enforcement, stable person identifiers, saved progress, and migration behavior. Add focused regression checks and verify that existing supported behavior still works.
4. **Document how another operator uses it.** Update the installation guide, configuration examples, and upgrading guide where applicable. Explain prerequisites, provider selection, setup, expected results, compatibility limits, and any changed backup or recovery steps. Consult the provider's current official documentation.

Include verification evidence and remaining gaps in the pull request. Maintainers review both the implementation and the installation recipe before accepting a configuration as supported.

## Preserve access and saved data

Enforce authorization on the server, including API and MCP operations. Hidden interface controls do not grant or restrict access. Preserve Fieldbook's distinctions: published content is available to everyone admitted to an installation; learning groups guide relevance and assignments; teams independently scope manager reporting. Preserve overlapping assignment sources and saved learner progress.

The Release 1 baseline defines the current schema and initial setup directly. Database contract tests load that same baseline with local substitutes for hosted services; verify hosted extensions and installation through an isolated backend. Add new database migrations rather than editing migrations shipped in a release. Keep [the single fresh-install command](docs/installation.md#3-set-up-the-database) working as migrations are added. Verify fresh setup and upgrades of existing data with checks proportionate to the change, using local or available non-production environments. Document any required application and database deployment order in the [upgrading guide](docs/upgrading.md). An application build does not apply migrations to an operator's database.

## Check the changed behavior

Choose checks that match the change and its risk. Available commands are defined in `package.json`:

| Change | Relevant checks |
| --- | --- |
| TypeScript or shared models | `pnpm typecheck` and focused tests for the changed behavior. |
| Provider integration or service boundaries | `pnpm check:providers`, relevant tests, and direct verification on the affected provider. |
| Interface or interactions | `pnpm check:ui` and relevant Playwright checks, such as `pnpm test:ui`. |
| Substantial changes or release work | Broader tests and builds appropriate to the affected apps, including `pnpm test`, `pnpm build`, or `pnpm build:demo`. |

Add or update tests when needed to catch a meaningful regression. Do not weaken checks to accommodate an implementation. A build or simulated test does not establish that authentication, private storage, migrations, or live permissions work in a deployed installation.

## Submit a pull request

Please use the [pull request template](.github/pull_request_template.md) as a starting point. You can adapt its format and omit sections that do not apply; an equivalent description is welcome. The template's formatting is not a condition of review. Keep the explanation proportional to the change and provide the relevant information below:

- The meaningful implementation changes and any compatibility or migration effects.
- The checks you ran, their results, and any behavior that remains unverified.
- Documentation updates: list the repository guides or configuration examples you changed. If the change affects documentation on thefieldbook.org, describe what needs updating and link the affected articles when known. If you cannot check the articles, name the topic for maintainer review.
- Screenshots or a short demonstration when they clarify a visible change, using synthetic data.

Update affected repository guides in the same contribution. Get maintainer agreement before adding another guide; do not create task reports or duplicate the product documentation library. Documentation on thefieldbook.org is maintained separately: flag required updates in the pull request. Maintainers track that work and update and publish the affected documentation as part of the release.

Keep public instructions current, concise, and usable without private project context. Keep private plans, internal testing status, and task logs out of those guides; put review evidence in the pull request.

Report vulnerabilities through [private security reporting](SECURITY.md), rather than a public issue. Review any automated deployment effects before pushing a branch. Submitting or accepting a code change does not by itself authorize changes to an operator's database or installation.
