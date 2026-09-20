# Contributing to Fieldbook with AI agents

These instructions apply to AI-assisted contributions throughout this repository. Read `README.md` and `CONTRIBUTING.md` before making changes, then consult the documentation and code relevant to the task. Contributions should be understandable without access to private conversations or a particular agent's memory.

## Product principles

Fieldbook is a lightweight learning and knowledge platform combining Field Notes for updates, Learning for courses and knowledge checks, and Knowledge for maintained reference articles.

Keep it practical and maintainable for independent operators and small teams. Prefer focused changes that solve a concrete user problem. Discuss major architectural changes before implementing them. Keep installation-specific content, branding, accounts, and configuration separate from reusable application code.

## Repository layout

- `app/`: browser-local interactive demo with simulated identity and sample data.
- `production/`: Next.js server application, authentication, APIs, and MCP tools.
- `components/` and `lib/`: shared interface components and application models.
- `supabase/migrations/`: database and storage migrations.
- `tests/` and `production/tests/`: application behavior and server tests.
- `docs/`: installation, operation, and release documentation.

The documented production stack is Vercel, hosted Supabase, and Google sign-in. Consult `production/README.md` for setup. Do not assume that demo features are available in production or that alternative providers are supported without checking the implementation.

## Making changes

- Inspect the current branch and existing changes. Preserve work unrelated to the task.
- Follow established code patterns and keep changes scoped to the requested behavior. Avoid unrelated refactoring or dependency upgrades.
- Check both demo and production when modifying shared components or models.
- Enforce authorization on the server. Hidden controls and client-side state are not permission boundaries. Validate API and MCP inputs at their server boundaries.
- Preserve the distinction between course assignment, content visibility, and reporting permissions. Consult the current learning model and permission implementation before changing them.
- Add new migrations instead of modifying migrations that may already have been applied. Document schema changes and their upgrade requirements.
- Use an isolated development backend for tests and local development. Keep credentials, local environment files, and personal data out of commits, fixtures, logs, and screenshots. Use synthetic data and placeholder configuration in examples.
- Treat installation content as operator-owned data. Avoid changes that overwrite it or couple the application to a particular deployment.

## Development and verification

Use the Node.js and pnpm versions specified in `package.json`. Install dependencies with `pnpm install --frozen-lockfile`.

- `pnpm dev` runs the browser-local demo.
- `pnpm dev:production` runs the server application with the development environment described in `production/README.md`.

For runtime changes, run:

```sh
pnpm test
pnpm build
pnpm build:production
```

Add or update meaningful tests for changed behavior, particularly authorization, data persistence, and learning-progress rules. For interface changes, check affected user flows, keyboard interaction, and relevant screen sizes. Documentation-only changes need checks against the implementation and valid relative links; they do not require new behavior tests.

Report which checks passed, which could not run, and any remaining limitations. Distinguish local validation from preview or production verification. A successful build does not establish that an installation works end to end.

## Documentation and delivery

- Update relevant documentation when behavior, configuration, or installation steps change.
- Record user-visible changes under Unreleased in `CHANGELOG.md`.
- Write clear, concrete instructions. Describe verified capabilities and identify limitations without inventing roadmap commitments.
- Explain the problem, resulting behavior, and verification in the contribution summary. Include migration or compatibility implications where applicable.
- Follow `docs/releases.md` for release work. Contributions do not by themselves authorize publishing a release, deploying an installation, or modifying its database; follow the scope authorized by the maintainer or operator.
