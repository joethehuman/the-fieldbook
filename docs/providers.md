# Hosting and service providers

Fieldbook targets managed hosting that can run its Next.js Node application, with PostgreSQL for persistence. The supported installation is Vercel + hosted Supabase + Google sign-in. Each installation supplies its own accounts, credentials, domain and data.

The goal is a choice of complete stacks for a fresh installation. A future DigitalOcean recipe can include its own managed PostgreSQL, private storage and external identity service. A contributor implements the affected adapters and setup, then contributes that complete recipe so another operator can select it. Reusing Supabase on a new host is also possible. Moving an existing installation between stacks is a separate problem and is not required for a new recipe.

## Where the boundaries live

| Area | Fieldbook owns | Current implementation |
| --- | --- | --- |
| Hosting | Trusted canonical origin, preview isolation and app identity | `server/deployment.ts`, `server/providers/vercel/deployment.ts`; ordinary Node configuration in `server/providers/node/deployment.ts` |
| Telemetry | Optional host integration and operator opt-outs | `server/telemetry.tsx`; official Vercel SDK components in `server/providers/vercel/telemetry.tsx` |
| Persistence | Content validation, permissions, publication, quiz grading and reporting calculations | `server/ports/data.ts`, composed in `server/data.ts`; Supabase queries and complete reads under `server/providers/supabase/` |
| Identity | Registration policy, active people, roles, MCP grants and same-origin checks | `server/identity.ts`, plain types in `server/ports/identity.ts`; Supabase browser sessions and OAuth operations in its adapter |
| Private files | Upload limits, ownership, readiness, reference protection and access checks | `server/ports/storage.ts`, composed in `server/storage.ts`; Supabase Storage behind signed upload/read instructions |
| Recovery | Immediate logical deletion, 30-day restoration, retry and permanent-erasure policy | Fieldbook bulk/cleanup services; current SQL transactions and provider identity/object operations |

Routes validate requests and call Fieldbook services. Adapters translate provider operations into plain values and application errors. Browser uploads receive a temporary request instruction; browser code does not construct a provider SDK client. Stored media references stay `/api/media/{id}.{extension}` so published content does not store temporary provider URLs.

These are interfaces for operations the application already needs. There is one service implementation, selected through ordinary imports. There is no dynamic plugin registry or alternate-provider stub.

## MCP contract

`lib/mcp-contract.ts` defines provider-neutral tool inputs, outputs, annotations and errors. `lib/mcp-access.ts` defines role and connection permissions. The generated `docs/mcp-contract.json` is checked with `pnpm check:mcp`. Catalog/media operations use `server/ports/mcp-data.ts`; scoped reports use `server/ports/mcp-reporting.ts`; identity and private transfers use the existing identity/storage ports. All clients call the same contract regardless of provider. A new adapter must preserve fresh authorization, explicit consent, atomic revisions, complete pagination and verified private uploads. It must translate its own provider errors and pass the SDK contract/security tests plus real hosted acceptance. No alternative provider is supplied by this change.

## Current deployment configuration

Follow the [installation guide](installation.md) and [Vercel recipe](../deployment/vercel/README.md).

`FIELDBOOK_HOST` accepts `vercel` or `node`. When omitted, Vercel's environment selects `vercel`; an ordinary local process selects `node`. Existing Vercel installations need no new value. An unknown host or a conflicting Node selection inside Vercel fails configuration.

- Vercel Production uses `FIELDBOOK_URL`. Vercel Preview keeps the trusted branch hostname and accepts its unique deployment hostname for same-origin requests.
- Node uses the operator's `FIELDBOOK_URL`, without deriving an origin from incoming request headers. It is the local/standard runtime configuration, not evidence that a particular managed host works.
- `FIELDBOOK_ENVIRONMENT=preview` applies the preview guard on another host. Every preview must use `FIELDBOOK_PREVIEW_SUPABASE_REF` matching its isolated backend. Never use the production backend for preview writes.
- Keep `FIELDBOOK_APP_KIND=installed` for an installed deployment and `demo` for the optional demo. Build markers identify which application and revision is served.

There are no alternate database/auth/storage selection variables. A contributor supplies a real adapter and updates the small composition modules before describing it as supported.

## Add a complete installation recipe

1. Start from a chosen release or development snapshot in your fork. Decide the complete stack: host, PostgreSQL service, identity/sign-in and private storage. Use dedicated accounts/backends for fresh-install acceptance; implement the service boundaries that differ from the current recipe.
2. Provide a recipe under `deployment/{host}/` with build/start commands, Node/pnpm versions, environment setup, canonical domain, identity callback allowlists, preview isolation and cleanup-worker destination. Link existing installation instructions instead of duplicating them. Include checked-in host configuration when useful; credentials and instance IDs stay private.
3. Connect the recipe to the composition modules (`server/data.ts`, `server/identity.ts`, `server/storage.ts` and the media/cleanup data boundaries). Add a named recipe selection when a second implementation exists; keep unsupported choices from silently falling back to the current provider. Reuse Node configuration when it fits. If a host supplies trusted preview/canonical metadata, add a small hosting module and an explicit selector in `server/deployment.ts`. Never infer trusted origins from arbitrary request headers.
4. Verify the installed app, rather than deploying the static demo. A host must support server routes, cookie refresh, server-only credentials, private/no-store responses, Next.js caching/revalidation and the authenticated MCP endpoint when enabled. Review reverse-proxy/CDN behavior and multi-instance cache invalidation for the actual deployment.
5. Check real sign-in/callback/logout, active-account denial, administration, draft/save/publish/revision conflict, learner progress, private image/video upload/read, search, scoped reporting and cleanup. If MCP is enabled, also verify consent, the resource-specific token audience and revocation. Record the application revision, host adapter/runtime versions and exactly what was exercised in the PR.

Build passing and synthetic tests establish useful local evidence. A complete stack recipe becomes a documented installation path after its fresh setup and real deployment are reviewed. DigitalOcean and Netlify have no verified recipe here yet. See [Next.js self-hosting requirements](https://nextjs.org/docs/app/guides/self-hosting) for the framework's host responsibilities.

## Add a backing service

Keep permissions and product rules in Fieldbook. Implement task operations behind the relevant boundary; do not expose a vendor query builder, arbitrary RPC interface or SDK response type to application callers. Run `pnpm check:providers` to check those source boundaries.

PostgreSQL is required. Preserve atomic revision comparisons, progress merges, audit writes, governance locks and indexed search. Preserve narrow published/admin projections, answer redaction and complete paginated reads that fail on incomplete results. A generic CRUD replacement is insufficient.

Private storage must support temporary non-upserting uploads, exact object metadata verification, temporary reads and idempotent removal. Respect an optional positive `FIELDBOOK_UPLOAD_MAX_BYTES` application limit and the provider's global/bucket limits; there is no fixed application ceiling. Return direct PUT instructions for small files or path-scoped TUS instructions for resumable transfers, with no server secret in either. The Supabase adapter uses its signed resumable endpoint for files above 6 MiB and 6 MiB chunks, with no upsert. Protect draft, published, artwork, settings and recovery references before deleting objects. An upload is not ready until the server verifies its exact owner, path, size and MIME type.

Identity verification must distinguish an absent session from provider failure, confirm the identity required for registration, refresh cookies safely and support active-account checks. MCP additionally requires verified issuer, resource audience and client identity plus fresh Fieldbook grants, roles, approved capabilities and managed-team scope. Login and authorization of an external MCP client are separate flows. Google is the sole supported sign-in option; email/password and an email delivery service are not part of this setup.

## Database and identity limits

The current migrations remain Supabase-specific. They combine ordinary PostgreSQL tables/functions/search with Supabase roles, private bucket provisioning, Auth foreign keys, the MCP token hook and the `pg_cron`/`pg_net` scheduler. Apply the single existing migration lineage; do not copy the schema into a second bootstrap directory or rewrite applied migrations.

A plain PostgreSQL database or Neon is not a drop-in replacement for the current recipe. A new recipe needs its own reviewed PostgreSQL provisioning for the application schema, privileges, atomic operations and provider-specific services. Keep shared application SQL in one maintained source when extracting reusable setup, and verify each recipe's resulting schema. Existing Supabase installations must continue to follow their immutable migration lineage. The cleanup worker's authenticated HTTP endpoint can be invoked by another scheduler, but changing the current scheduling setup still needs explicit provisioning and verified retries.

Fieldbook person IDs are stable roster IDs and can differ from the attached identity subject. The Supabase adapter maps `auth_user_id` to the person; its schema references `auth.users`. A fresh recipe for another identity service supplies suitable identity mapping and PostgreSQL provisioning instead of replaying Supabase-specific setup. It does not need to import or migrate any Supabase users. Preserve Fieldbook-owned roles, active status, stable person IDs and erasure/recovery rules.

Moving an existing installation between stacks is separate and currently unsupported. A contributor can deliver a fresh-install recipe without building that transfer path. See [versions and upgrades](upgrading.md) for the responsibilities when updating an existing installation.

## Platform features

Vercel Web Analytics and Speed Insights use their official Next.js SDKs, composed by `server/telemetry.tsx` from both root layouts. Host selection happens on the server; a non-Vercel host renders neither integration. The small Vercel client component owns the vendor imports and uses normal SDK behavior without custom events or URL filtering. See the [Vercel recipe](../deployment/vercel/README.md#analytics-and-speed-insights) for activation and independent opt-outs.

For another host's analytics, add its implementation under `server/providers/{host}/` and select it in `server/telemetry.tsx`. Keep SDK imports out of layouts and product components; extend `pnpm check:providers` to cover the new SDK. Document setup and verify script loading, route tracking and disabled behavior for that recipe. Analytics are optional: ordinary content, identity and persistence services must remain usable without them.

Add other optional platform features at their owning boundary and document activation, credentials and removal. AI Gateway is not installed or activated.
