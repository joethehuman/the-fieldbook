# Contributing

Fieldbook is preparing for its first public release. Until a license is selected, this repository is not yet a licensed open-source project.

Keep contributions small and describe the user problem, resulting behavior, and verification. Discuss major architecture changes before implementing them. Fixes should preserve the demo/production distinction and the separation between shared code and installation data.

## Development

Use Node.js 22.x and pnpm 10.17.1. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
# With a dedicated development backend and production/.env.local:
pnpm dev:production
```

Before proposing runtime changes, run `pnpm test`, `pnpm build`, and `pnpm build:production`. CI runs these checks on pull requests. For documentation-only changes, check instructions against the code and verify relative links; no new behavior tests are necessary.

Never commit secrets, exports containing personal data, `.env.local`, or provider credentials. Examples must use placeholder domains and keys. Shared UI changes should be checked in both applications. Production authorization belongs on the server, not in hidden buttons or client state. Database changes require a new migration and upgrade guidance; do not rewrite an already-applied migration.

## Interface contributions

Read [Fieldbook interface standards](docs/design-system.md) before changing UI. Reuse shared controls and layout patterns across both applications; add missing patterns centrally instead of introducing feature-specific styling. Run `pnpm check:ui` and, after the demo build, `pnpm test:ui`; inspect the screenshot report for affected surfaces.

## Reporting problems

Include expected/actual behavior, version or commit, deployment mode, and minimal reproduction steps. Remove tokens, credentials and learner data from logs/screenshots. Do not post exploitable vulnerabilities or private data in public issues. A private security-reporting channel must be established before public release; see the [release process](docs/releases.md).

## Scope and releases

The documented stack is Vercel, hosted Supabase, and Google sign-in. Do not describe alternative providers or demo-only functionality as supported production features. There is no promised roadmap or release schedule. Record user-visible changes under Unreleased in [CHANGELOG.md](CHANGELOG.md); use the [manual release process](docs/releases.md) when preparing a release.
