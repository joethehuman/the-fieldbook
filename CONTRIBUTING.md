# Contributing

Fieldbook is source available under the [Elastic License 2.0 (ELv2)](LICENSE). See [licensing](docs/licensing.md) for the permitted uses, restrictions and third-party notices.

Submit contributions under ELv2 unless the maintainer agrees otherwise. Only contribute material you have the right to license, and preserve applicable third-party notices.

Keep contributions small and describe the user problem, resulting behavior, and verification. Discuss major architecture changes before implementing them. Fixes should preserve the demo/production distinction and the separation between shared code and installation data.

## Development

Use Node.js 22.x and pnpm 10.17.1. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:demo
# With a dedicated development backend and root .env.local:
pnpm dev
```

Choose checks for the changed behavior and risk. Small documentation changes need source review and valid relative links, not behavior tests or builds. For substantial runtime changes, run focused tests and the affected builds; before a release, use the broader release-candidate checks in `docs/releases.md`. Do not manually trigger or rerun CI merely to collect routine preview evidence.

Never commit secrets, exports containing personal data, `.env.local`, or provider credentials. Examples must use placeholder domains and keys. Shared UI changes should be checked in both applications. Production authorization belongs on the server, not in hidden buttons or client state. Database changes require a new migration and upgrade guidance; do not rewrite an already-applied migration.

## Interface contributions

Read [Fieldbook interface standards](docs/design-system.md) before changing UI. Reuse shared controls and layout patterns across both applications; add missing patterns centrally instead of introducing feature-specific styling. Run `pnpm check:ui` and, after the demo build, `pnpm test:ui`; inspect the screenshot report for affected surfaces.

For authoring changes, also run `pnpm test:authoring` after both builds. Build the server test bundle with `NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-test-key`. The suite serves both built applications, intercepts API/Storage traffic with synthetic fixtures, and checks navigation, pending uploads, save failures and recovery on desktop and phone. Do not supply real backend credentials. This does not establish hosted Auth/Storage behavior. Use `FIELDBOOK_TEST_PORT` and `FIELDBOOK_SERVER_TEST_PORT` for unused local ports, and `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. CI runs this suite and uploads its screenshots/traces alongside the existing UI report.

For account and branding changes, also run `pnpm test:accounts` after both builds using the synthetic production build variables above. This suite starts a local fixture service on port 3130, the server app on 3131 and the demo on 3132. A test-only preload redirects server-side requests for `test.supabase.co` to that fixture; browser provider navigation is simulated. Never load this preload in an installation or supply real credentials. Screenshots cover desktop and phone account pages. These checks do not establish hosted authentication or Storage behavior.

For search changes, run `pnpm test:search` after both builds with the synthetic build variables above. This runs the server API against a local HTTP fixture backed by embedded PostgreSQL, including the larger search corpus, publication/access checks, delayed responses and mobile screenshots. See [search verification](docs/search.md).

For reporting changes, run `pnpm test:reporting` after both builds with the same synthetic build variables. It serves demo and production UI fixtures on ports 3147/3148 and captures actual CSV downloads and desktop/phone screenshots. Use `FIELDBOOK_TEST_PORT` and `FIELDBOOK_SERVER_TEST_PORT` to select unused ports. Run browser suites sequentially to preserve their nested output folders. See [reporting verification](docs/reporting.md).

## Reporting problems

Include expected/actual behavior, version or commit, deployment mode, and minimal reproduction steps. Remove tokens, credentials and learner data from logs/screenshots. Do not post exploitable vulnerabilities or private data in public issues. Use the [security reporting instructions](SECURITY.md), including their private-reporting path when available; see the [release process](docs/releases.md).

## Scope and releases

For hosting or service changes, read [hosting and service providers](docs/providers.md). Add a concrete recipe or implementation and verify the affected flows; keep application policy outside provider adapters. Run `pnpm check:providers` for service changes. A new stack recipe must demonstrate fresh installation; transferring an existing installation between stacks is optional separate work.

The documented stack is Vercel, hosted Supabase, and Google sign-in. Do not describe alternative providers or demo-only functionality as supported production features. There is no promised roadmap or release schedule. Record user-visible changes under Unreleased in [CHANGELOG.md](CHANGELOG.md); use the [manual release process](docs/releases.md) when preparing a release.

For guest recommendation changes, also run `pnpm test:guests` after both builds with the synthetic production build variables above. It covers demo/production desktop and phone settings, explicit group creation, recommendation states, local progress and simulated sign-in transitions. See [guest recommendation verification](docs/guest-recommendations.md#verification).

For reading-route, metadata or request-time access changes, run `pnpm test:reading` after both builds with the same synthetic production build variables. It checks HTTP responses, page payload redaction, no-JavaScript reading, publication/access transitions and simulated authenticated sessions on desktop and phone. Run it sequentially with account tests because they share fixture ports. See [reading pages](docs/reading-pages.md).

