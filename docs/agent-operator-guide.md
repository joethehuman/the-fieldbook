# Fieldbook operator handoff for AI agents

This guide gives an installation or maintenance agent a reliable starting point. The repository's [AGENTS.md](../AGENTS.md) governs code contributions; this page covers operating an independent installation. Use only the public repository and the operator's own provider accounts. Private maintainer plans, an existing Fieldbook installation and the browser-local demo are not setup instructions.

## Establish the target

Before changing anything, record the exact Fieldbook commit or release, repository/branch, Vercel project and environment, Supabase project reference, Google OAuth client and canonical origin. Ask the operator to identify missing projects or credentials through their provider's secure setup flow. Never print or commit secrets. A source file, environment variable, dashboard setting, applied migration and deployed behavior are separate facts; verify each in its own place.

Use these guides in order:

1. [README](../README.md) for the product, release status and supported stack.
2. [Installation](installation.md) and the [Vercel recipe](../deployment/vercel/README.md) for a fresh deployment.
3. [Versions and upgrades](upgrading.md) before applying SQL or changing deployed code.
4. [Installation proof](installation-proof.md) for account, publication, progress, media, recovery and role checks.
5. [Administration](administration.md), [permissions](permissions.md), [learning model](learning-model.md), [MCP setup](mcp-setup.md) and [Ask AI](ask-ai.md) for specific operations.

## Preserve the supported boundary

The current complete recipe is Vercel, hosted Supabase and Google sign-in. `app/` is the installed server application; `demo/` is synthetic and browser-local. A provider interface in source does not mean another database, storage provider, identity service or host has a verified recipe. PostgreSQL alone does not replace Supabase Auth, Storage, the OAuth server, token hook or scheduled cleanup. See [provider boundaries](providers.md).

Each installation owns its data, credentials, domain, provider costs, backups and privacy notice. Keep previews with real writes on an isolated backend. Never use production as a trial migration target. The first SQL-editor application must include every migration in filename order; keep an external ledger because SQL-editor runs do not register as CLI migrations. Upgrades apply only missing files after rehearsal, with database work before dependent deployment. An automatic Git deployment can occur on a branch push or merge.

## Use authority at the correct layer

Fieldbook roles, active status and a connection's approved capabilities determine access. OAuth identity scopes, a hidden button or a user's natural-language request cannot grant server privileges. Published content is visible to everyone admitted to the installation; teams and learning groups shape assignments/relevance, not content ACLs. Teams separately scope manager reports. See [permissions](permissions.md).

MCP clients should call `get_capabilities` first, then use only permitted tools. Search, media and named reports are paginated; follow `nextCursor` until `complete` and restart if scope or filters change. Fetch a current draft and revision before editing, preserve other fields, save with `expected_revision`, read back, then publish only as a separate intentional action. `create_content` makes a draft. Uploads require transferring bytes using the returned temporary PUT/TUS instruction, followed by `complete_media_upload`; a transfer URL is not a content reference. Unsupported account, settings and hierarchy operations belong in the Fieldbook Admin screen. See [MCP setup](mcp-setup.md) and the machine-readable contract in `docs/mcp-contract.json`.

For Admin work, verify actions against the current screen and role. A CSV import is a reviewed atomic roster operation, not directory synchronization. A due-date setting change does not silently recalculate existing targets. A Course edit does not automatically require a new completion version. Content drafts remain separate from the published copy. See [administration](administration.md).

## Report proof and limits

Give the operator a short result table: action, exact source or environment, observed result, and any unverified dependency. A green build is source evidence; a migration result is database evidence; a READY deployment is host evidence; a signed-in action is product evidence. Include the commit and migration ledger, but redact credentials and personal data. When an instruction fails, record the exact step and behavior before changing the guide or product. Do not claim a complete fresh installation or recovery until the [installation proof](installation-proof.md) has exercised it.
