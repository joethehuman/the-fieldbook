# Working in The Fieldbook

These instructions apply to AI-assisted work in this repository. Read README.md and CONTRIBUTING.md first. Base product claims on current code and the actual interface; do not require private project notes or conversation history.

## Boundaries

- The repository root is the installed Next.js app. demo/ is a separate browser-local demo with fictional data. components/ and lib/ are shared; app/ and server/ provide installed-app behavior; supabase/migrations/ holds ordered database changes.
- The documented installation uses Vercel, hosted Supabase, and Google sign-in. Verify another stack before describing it as supported. Keep operator accounts, content, branding, and configuration out of reusable source.
- Published content is visible to everyone admitted to an installation. Learning groups guide relevance and course assignments, not access. Teams independently scope manager reporting. Preserve overlapping assignment sources and saved learner progress.
- Enforce permissions on the server for API and MCP operations. Hidden controls or client-side state do not grant access. Use synthetic data in examples and tests; never commit credentials or personal records.

## Changes and checks

Inspect the current branch, diff, and nearby implementation before editing. Preserve unrelated work. Add a new migration for schema changes; never rewrite a migration that may already have run. Explain the deployment order and rehearse data changes outside production.

For interface work, use shared controls and patterns in components/ui/ and components/patterns/, and follow [docs/design-system.md](docs/design-system.md). Check the installed app and demo when changing shared code. For other work, choose focused checks from package.json that match the risk. Report what was checked and what still needs hosted verification. A build does not prove Auth, Storage, migrations, or live permissions.

Keep public instructions concise and self-contained. The repository guides cover installing, upgrading, contributing, security, and interface conventions; product usage belongs on the Fieldbook site. Do not add private plans, branch logs, or one-off audits to the repository. A code change does not authorize deployment, database changes, or publication.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

