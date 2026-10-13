# Install The Fieldbook

The Vercel recipe uses hosted Supabase for database, authentication and private media, and Google sign-in. The [DigitalOcean recipe](#digitalocean-app-platform) uses App Platform, managed PostgreSQL, self-hosted Supabase and optional DO inference. Each operator supplies their own accounts. Use Node.js 22 and pnpm 10.17.1 for setup. A custom domain is optional.

## 1. Get the source and create a Supabase project

Copy or fork [the Fieldbook repository](https://github.com/joethehuman/the-fieldbook) into your own GitHub account. Choose a release tag or commit and keep a local copy of that same source version. Your repository and deployment branch control when you take updates. Preserve the ELv2 license and third-party notices.

Create a dedicated, empty hosted Supabase project. Note its project reference, project URL, publishable key and server-only secret key. Keep its database password and credentials secure. For an existing Fieldbook database, follow [upgrading](upgrading.md).

## 2. Configure Vercel

Import your repository into Vercel and choose its production branch. Use:

| Setting          | Value                            |
| ---------------- | -------------------------------- |
| Framework        | Next.js                          |
| Root Directory   | Repository root; leave empty     |
| Node.js          | 22.x                             |
| Install Command  | `pnpm install --frozen-lockfile` |
| Build Command    | `pnpm build`                     |
| Output Directory | Next.js default                  |

Add these variables to Vercel's **Production** environment:

| Variable                               | Value                                        |
| -------------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Your Supabase project URL                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Its publishable key                          |
| `SUPABASE_SECRET_KEY`                  | Its complete server-only secret key          |
| `FIELDBOOK_URL`                        | Your canonical HTTPS origin, with no path    |
| `FIELDBOOK_OWNER_EMAIL`                | The Google email for the first administrator |
| `FIELDBOOK_APP_KIND`                   | `installed`                                  |

Never put the secret key in a `NEXT_PUBLIC_` variable or commit credentials. Copy the complete key rather than an abbreviated dashboard display.

Deploy the app. You can use its assigned Vercel domain. If that address differs from `FIELDBOOK_URL`, correct the variable and redeploy. Environment changes take effect after redeployment.

On Vercel, Analytics and Speed Insights default on. Set `FIELDBOOK_VERCEL_ANALYTICS_ENABLED=false` or `FIELDBOOK_VERCEL_SPEED_INSIGHTS_ENABLED=false` to disable either. Other optional settings are listed in [.env.example](../.env.example).

## 3. Set up the database

From the root of your local source copy, with Node.js 22, run:

```sh
node scripts/setup-database.mjs
```

Enter the Supabase project reference and deployed Fieldbook HTTPS address. Confirm the target by typing `SETUP`. Open the Supabase login link in your browser and complete verification when prompted.

The command downloads a pinned Supabase CLI, applies the database migrations, creates the private media bucket and connects hourly deletion cleanup. No separate CLI installation, Docker or individual SQL commands are needed.

The cleanup route must be reachable without Vercel deployment protection. Fieldbook's members-only browsing setting does not block this route.

If the database migrations finished but the final cleanup connection failed, rerun the same command. It can finish an unused installation with matching migrations and no configured cleanup endpoint. It refuses configured installations, existing content, people or media, and unrelated application tables. If a migration itself failed, read the Supabase error before retrying; do not reset a database with data.

## 4. Configure Google sign-in

In Google Cloud, create or select a project. Configure its OAuth audience and branding for your intended users, using only the basic `openid`, email and profile identity scopes. Create an OAuth **Web application** client.

- Authorized JavaScript origin: your `FIELDBOOK_URL`.
- Authorized redirect URI: `https://PROJECT_REF.supabase.co/auth/v1/callback`.

In Supabase Auth, enable the **Google** provider and enter the client ID and client secret. Under **URL Configuration**, set **Site URL** to `FIELDBOOK_URL` and allow:

```text
https://YOUR-FIELDBOOK-HOST/auth/callback
```

Google returns to Supabase; Supabase returns to Fieldbook. Use the exact callback shown by your Supabase project. See [Supabase's Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

Google's Testing allowlist has an exception for apps using only these basic identity scopes. Use Fieldbook's registration setting to control admission. [Google's audience guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) explains its account and publishing options.

Sign in with `FIELDBOOK_OWNER_EMAIL`. The first verified registration at that address creates the administrator. Changing the variable later does not transfer an existing administrator or promote an already registered learner.

## 5. Start using Fieldbook

Open **Manage organization → Access** and choose public or members-only browsing and open or closed registration. A new installation defaults to public browsing and open registration. Closed registration requires preregistering a person's Google email in **People**; no invitation email is sent.

Create and publish your first content, then open it as a reader. A new database has no demo content. Installation name, home page, privacy notice, teams, learning audiences and due dates can be configured as needed.

The media bucket stays private. Upload size depends on your storage provider and bucket settings; Fieldbook adds a size limit only if you set `FIELDBOOK_UPLOAD_MAX_BYTES`. Supported uploads are JPG, PNG, WebP, GIF, MP4 and WebM. Fieldbook does not transcode video.

Deleted content and accounts have a 30-day recovery window, followed by hourly permanent cleanup. If cleanup needs attention, **Recently deleted** shows the operator warning.

## Optional services and development

- **Ask AI:** off by default; [configure it](https://www.thefieldbook.org/docs/02dbd607-82c5-46ed-9877-debc2c24538a) if you want generated answers from published content.
- **MCP:** [configure authorization and an AI client](https://www.thefieldbook.org/docs/76be7ee8-371d-4ed0-b57f-1277460df3fe) if publishing or reporting accounts need external AI tools.
- **Privacy notice:** host a notice in Fieldbook or link to an existing one if you choose to publish one.
- **Backups:** choose your own recovery arrangements. Supabase's [database backup options](https://supabase.com/docs/guides/platform/backups) depend on the plan; database backups do not include uploaded Storage file bytes.
- **Previews:** optional. Use a separate Supabase project and Google configuration. Vercel detects preview deployments automatically; set `FIELDBOOK_PREVIEW_SUPABASE_REF` to that backend's reference alongside its credentials. The app checks that its URL matches the declared reference. Keep production credentials out of previews.
- **Local development:** copy `.env.example` to `.env.local` with a dedicated development backend. Set `FIELDBOOK_URL=http://127.0.0.1:3000` and allow that origin's `/auth/callback` in Supabase. Run `pnpm install --frozen-lockfile` and `pnpm dev`.
- **Demo:** `pnpm dev:demo` runs fictional browser-local data without a backend. It is a separate optional app and does not provision an installation.

## DigitalOcean App Platform

This candidate recipe runs Fieldbook and Supabase Auth, REST/PostgREST and Storage on App Platform, with **Managed PostgreSQL 17** and **private Spaces**. It needs no Supabase Cloud account, Droplet, Kong, Studio, Realtime or Edge Functions. The application, permission rules and released database schema are shared with Vercel. The DigitalOcean configuration is not yet supported for production; complete the acceptance checks below before relying on an installation.

### Pinned components and compatibility

Use this combination rather than independently choosing backend versions. The backend pins come from the [Supabase self-hosting configuration at `cb4307f`](https://github.com/supabase/supabase/tree/cb4307f15b99e02a8a56e103086d1eab72eb9e9a/docker). Image digests in the Dockerfiles and app spec prevent mutable tags from silently changing a deployment.

| Component | Selected version | Verification scope |
| --- | --- | --- |
| Fieldbook runtime | Node 22.23.3, pnpm 10.17.1; locked Next.js 16.3.8 | Local builds/regressions; App Platform publication, reading, saved progress and scheduled content cleanup |
| Supabase Auth | `supabase/gotrue:v2.196.0` | Fresh vendor initialization; real Google sign-in/preregistration, inactive/deleted-account denial and permanent deletion; human refresh; MCP PKCE/consent/refresh/current-role enforcement and SDK client |
| PostgREST | `postgrest/postgrest:v14.17` | Verified database TLS; hosted application permissions, publication and persistent learning records |
| Supabase Storage | `supabase/storage-api:v1.74.0` | Fresh vendor migrations through 69; wrong CA/hostname rejected; ordinary and >6 MiB resumable Spaces transfers; unsigned private bytes denied |
| Managed database | PostgreSQL 17.11 tested; provider-maintained minor version | Fresh preparation, vendor initialization and Fieldbook baseline; existing-data update dry run/apply preserved records, ledger and cleanup with no pending migrations |
| Optional inference | DO custom router with `openai-gpt-oss-20b` and `openai-gpt-oss-120b` | Real forced-tool and streaming checks; primary and unmatched-task fallback selection observed. Failure-driven failover remains unverified. Provider service is public preview. |

The table records checks actually performed, not a general compatibility guarantee. Complete the remaining acceptance checks below before changing this candidate's support status. Protocol-level MCP checks do not establish acceptance in every consumer client. The existing-data update check had no pending SQL; pending-migration transaction/ledger behavior is covered by a disposable local harness, not a hosted schema update. Vercel with hosted Supabase remains the supported recipe. Arbitrary backend combinations, PostgreSQL major versions, automatic router pools and horizontally scaled Fieldbook instances are outside this baseline.

Application redeployment and a full service restart preserved accounts, published content, saved progress, private files and MCP refresh. A partial 7 MiB upload recovered its saved 6 MiB offset after service replacement; its expired signature required reauthorization before completion. This establishes backend upload-state durability, not automatic browser recovery after authorization expires. Restoring a backup and changing upstream backend component versions with existing data have not been exercised on this baseline.

### Prepare durable resources and keys

1. Create a dedicated Managed PostgreSQL **17** cluster/database and a private Spaces bucket in suitable regions. Use the database's certificate-matching DNS hostname and download its CA certificate. After connecting the app to its VPC, add its **VPC egress private IP addresses** to the database's trusted sources, along with the temporary operator connection used for setup. The app API returns these under `vpc.egress_ips`; selecting the app itself as a trusted source does not authorize this private path. Recheck the addresses after network changes. Follow [DO's VPC connection guidance](https://docs.digitalocean.com/products/app-platform/how-to/enable-vpc/), keep the app and database in the intended VPC, and use direct database connections rather than a transaction pooler.
2. Create Spaces credentials scoped to that bucket with read, write and delete access. Keep the bucket private; do not enable public ACLs or a public CDN. Fieldbook issues short-lived access through the Storage service.
3. From the source checkout, run `pnpm install --frozen-lockfile`. Generate durable keys into an existing private directory outside the repository:

```sh
node scripts/generate-self-hosted-keys.mjs --output /private/path/fieldbook-keys.env
```

The command creates an owner-readable file and refuses to overwrite it. It creates an ES256 signing key, legacy Storage signing secret, JWT API keys, and three independent service database passwords. Keep the original file in your secret manager and backup set. Reuse it after restarts, source updates and redeployments. The API keys expire after five years; plan their rotation before expiry. `JWT_KEYS`, `JWT_JWKS` (which includes a symmetric verification secret), `JWT_SECRET`, service key and database passwords are all server-only. This recipe uses JWT `ANON_KEY` / `SERVICE_ROLE_KEY`; opaque `sb_publishable_` / `sb_secret_` keys require an API gateway and are not used here.

4. In another private environment file, set `FIELDBOOK_SETUP_DATABASE_URL` to the administrator connection and `FIELDBOOK_SETUP_DATABASE_CA` to the downloaded certificate path. Run:

```sh
node --env-file=/private/path/database.env --env-file=/private/path/fieldbook-keys.env scripts/prepare-digitalocean.mjs
```

Confirm the displayed hostname/database by typing `PREPARE`. The command runs [.do/prepare-supabase-backend.sql](../.do/prepare-supabase-backend.sql) transactionally. It refuses existing Auth/Storage schemas, service roles or application tables, creates the minimal roles/schemas/helpers, and sets independent passwords. It is only for a fresh dedicated backend, never an upgrade command. Auth and Storage subsequently create their own tables and migration ledgers. Keep the administrator credential out of running services.

### Configure App Platform and Google

Copy [.do/app.yaml](../.do/app.yaml) into a private operator workspace. Replace every `YOUR_` value, including source repository/branch, VPC, attached managed cluster, database DNS and credentials, Spaces, owner email, Google client, and domain. Never commit the populated spec. Select service sizes for your workload; the example fixes one instance per service and does not provision an autoscaling topology. App Platform's public `git` source does not automatically follow each push; choose deployment triggers deliberately. Auth, REST and Storage each have a configured pool limit of five; account for additional service connections, operator access and old/new instances overlapping during redeployment when choosing database capacity. Do not leave Auth's pool unlimited or assume three configured limits describe every connection.

The app spec runs:

- **Fieldbook:** the existing standalone Next.js build, with the same application environment as Vercel and `FIELDBOOK_HOST=node`.
- **Auth:** the pinned upstream image plus a small startup wrapper that writes the database CA from its environment to a private temporary file before starting Auth.
- **REST:** the pinned PostgREST image plus the same CA wrapper and a pinned static BusyBox shell. Its readiness port is internal only.
- **Storage:** the pinned upstream image plus the same CA wrapper, private Spaces credentials and persistent PostgreSQL/S3 state. No file bytes depend on the container's local disk.
- **Cleanup:** the hourly App Platform job. Omit this job from the initial deployment until its credential exists, then add it after database setup below.

Map generated keys as follows:

| Generated value | Component environment |
| --- | --- |
| `ANON_KEY` | Fieldbook `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; Storage `ANON_KEY` |
| `SERVICE_ROLE_KEY` | Fieldbook `SUPABASE_SECRET_KEY`; Storage `SERVICE_KEY` |
| `JWT_SECRET` | Auth `GOTRUE_JWT_SECRET`; Storage `AUTH_JWT_SECRET` |
| `JWT_KEYS` | Auth `GOTRUE_JWT_KEYS` |
| `JWT_JWKS` | REST `PGRST_JWT_SECRET`; Storage `JWT_JWKS` |
| Three database passwords | Matching `supabase_auth_admin`, `authenticator`, `supabase_storage_admin` connection URLs |

Use runtime-only secret variables for server secrets. Supply the two public Supabase variables at build and runtime because Next.js embeds public variables in browser assets. Generated hex database passwords are URL-safe. All three backend services use `sslmode=verify-full` and the materialized CA file. Storage also receives the CA PEM via `DATABASE_SSL_ROOT_CERT`: its tenant pool uses that setting, while its PubSub connection reads TLS settings from `DATABASE_URL`. **Use a DNS hostname, not an IP address** (the upstream Storage version weakens identity verification for IP connections). Do not disable certificate verification or add an insecure URL SSL override.

Use a custom HTTPS hostname and disable App Platform edge caching. Add its CNAME at the existing DNS provider using DO's assigned target; domain registration and nameservers need not change. `${APP_URL}` must resolve to the canonical hostname. `FIELDBOOK_URL` is that origin; `NEXT_PUBLIC_SUPABASE_URL` is that origin followed by `/backend`. For a separate preview, set `FIELDBOOK_ENVIRONMENT=preview` and `FIELDBOOK_PREVIEW_SUPABASE_URL` to the exact isolated backend URL. Hosted Supabase previews retain their reference-based configuration.

Ingress strips `/backend/auth/v1`, `/backend/rest/v1` and `/backend/storage/v1` before forwarding to the respective service. It separately rewrites the RFC 8414 discovery path `/.well-known/oauth-authorization-server/backend/auth/v1` to Auth's metadata route. The `/upload/resumable` alias preserves Storage's returned TUS `Location` path for subsequent PATCH, HEAD and DELETE requests. `STORAGE_PUBLIC_URL` fixes the public origin; forwarded-prefix interpretation stays off. No custom gateway or header rewriting is needed. Signed uploads and Supabase's JWT/SQL permissions remain mandatory at the services; an `apikey` header alone is not authorization.

Keep the explicit upload lifetimes in the app spec: `UPLOAD_SIGNED_URL_EXPIRATION_TIME=7200` seconds and `TUS_URL_EXPIRY_MS=7200000` milliseconds. The selected Storage image otherwise signs uploads for only 60 seconds, which is unsuitable for large transfers. This recipe allows a two-hour transfer window using a signature restricted to the authorized object path. Expired authorization cannot resume a transfer; choose the file again. Durable partial bytes alone do not renew permission, and closing the browser does not promise automatic upload recovery.

Configure the Google OAuth Web client with the Fieldbook origin and this redirect URI:

```text
https://YOUR-APP-HOST/backend/auth/v1/callback
```

Auth's `API_EXTERNAL_URL` and JWT issuer include `/backend/auth/v1`, following current upstream guidance. Its Site URL is the Fieldbook origin and its allowlist is exactly `FIELDBOOK_URL/auth/callback`. Email/password, phone and anonymous Auth signups stay disabled. Keep `GOTRUE_DISABLE_SIGNUP=true` until Fieldbook setup completes, so an early Google login cannot populate the fresh backend. Then allow Google registration; Fieldbook's existing Access settings govern admission and roles. `FIELDBOOK_IDENTITY_PROVIDER` defaults to `supabase` for both recipes.

Deploy the services with the access-token hook and OAuth server initially disabled. Wait for Auth `/health`, Storage `/status`, and internal PostgREST port 3001 `/ready` to pass. They indicate process/dependency readiness, not successful user flows. Confirm `auth.users`, `auth.schema_migrations`, `storage.buckets`, `storage.objects` and `storage.migrations` exist before continuing.

### Install Fieldbook and enable cleanup

Add the canonical HTTPS `FIELDBOOK_URL` to the private setup environment, then run:

```sh
node --env-file=/private/path/database.env scripts/setup-self-hosted.mjs
```

Confirm the target with `SETUP`. The command applies the immutable released baseline and subsequent migrations, recording versions in `supabase_migrations.schema_migrations` in one transaction. The only baseline adaptation removes the hosted `pg_cron`/`pg_net` HTTP schedule; shared application SQL stays the same. It refuses an installation with accounts, content or files. The original `setup-database.mjs` remains the hosted Supabase setup path.

After setup, set Auth's `GOTRUE_DISABLE_SIGNUP=false` and enable `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true` using the already configured `pg-functions://postgres/public/fb_access_token_hook` URI. Read `fb_cleanup_config.secret` through the authorized private administrator connection; set it as the cleanup job's runtime-only `FIELDBOOK_CLEANUP_SECRET`, then add the job and redeploy. Keep the endpoint and secret across future upgrades. Verify an accepted job invocation and an actual scheduled run. The app's **Recently deleted** warning also reports cleanup health.

Sign in as `FIELDBOOK_OWNER_EMAIL` to create the first administrator, then configure Access. Enabling Google or obtaining a human session does not authorize MCP.

### Optional MCP

Enable Auth's `GOTRUE_OAUTH_SERVER_ENABLED` and `GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION`, keeping `/oauth/consent` as its authorization path and the custom access-token hook enabled. Fieldbook's MCP settings independently enable the feature and the user separately approves connection capabilities. Keep the original asymmetric key set so access tokens remain verifiable after a restart. Revocation and current Fieldbook roles/grants are checked per request; browser sign-out only ends its local session.

Use `https://YOUR-APP-HOST/api/mcp`. The endpoint uses the repository's pinned MCP SDK and Streamable HTTP contract in [mcp-contract.json](mcp-contract.json). Test the protocol versions and OAuth behavior of the actual intended clients, including ChatGPT, against this deployment. Verify resource discovery, issuer metadata, PKCE/consent, authenticated requests, refresh, revocation and denied capabilities. Do not infer client compatibility from reachable discovery or a successful human sign-in.

### Optional DigitalOcean Inference Router

[Inference Router](https://docs.digitalocean.com/products/inference/how-to/use-inference-router/) is in **public preview**. The current control panel no longer creates or edits custom routers; operators manage them through DigitalOcean's `/v2/gen-ai/models/routers` API. Configure a custom router with explicit model pools, priorities and fallback order there. Fieldbook only discovers and uses it; it does not administer the router.

Set these runtime variables on Fieldbook:

```text
FIELDBOOK_AI_ROUTER=digitalocean
DIGITALOCEAN_INFERENCE_ROUTER=router:fieldbook
DIGITALOCEAN_VERIFIED_MODELS=YOUR_TESTED_MODEL_ID,YOUR_TESTED_FALLBACK_ID
DIGITALOCEAN_MODEL_ACCESS_KEY=YOUR_ROUTER_SCOPED_MODEL_ACCESS_KEY
DIGITALOCEAN_ROUTER_READ_TOKEN=YOUR_SEPARATE_GENAI_READ_TOKEN
```

Create a [model access key](https://docs.digitalocean.com/products/inference/how-to/manage-model-access-keys/) restricted to the selected router and its explicit pool/fallback models. In the current control panel, leaving foundation-model selection empty grants **All models**, even when a router is selected. Explicitly select the required models and verify the created key's model and router scope before using it. Create a separate custom DigitalOcean API token with **`genai:read`** for router/model discovery. DO also adds its required read-only dependencies (`regions:read`, `sizes:read`, `actions:read`); grant no write scopes. Store both as server-only secrets. Never put a deployment token or router-write token in Fieldbook. Keep operator router-administration credentials outside the application.

Fieldbook lists custom routers through the router API, reads the explicitly configured target's detail, and checks every pool and fallback model against the separate model catalog. Every policy must declare its model IDs, and at least one fallback model must be explicit. All must advertise serverless text generation and `tool_calling`. The catalog does not establish streaming or forced tool-selection compatibility; some models require a different API or reject `tool_choice`. Search planning requires a forced `searchPublishedContent` tool call with valid queries through Chat Completions; answer generation requires streamed Chat Completions. Test both for every exact model in the pools and fallbacks, then list only those tested model IDs in `DIGITALOCEAN_VERIFIED_MODELS`. The setting is an operator attestation, not an automated probe. Missing catalog requirements or an unattested model prevents enabling/using the target. Custom target names must fit `router:` plus 1–153 lowercase letters, digits or hyphens.

The DO adapter sends `reasoning_effort: "low"` and caps `max_completion_tokens` at 1,024 for search planning and 2,048 for answers, with no automatic retries. These caps include reasoning and visible output; the smaller generic budgets can leave a reasoning model without enough tokens to produce its tool call or answer. [DO supports this reasoning control](https://docs.digitalocean.com/products/inference/how-to/use-reasoning/), and the selected `openai-gpt-oss-20b` and `openai-gpt-oss-120b` models [support low effort](https://github.com/openai/gpt-oss#highlights). Reasoning text is not exposed to users. Test each eligible model with Fieldbook's actual prompts, forced tool, streaming, these exact effort/token settings and the shared 45-second request deadline. A successful direct-model request with different settings does not establish compatibility. Token exhaustion fails the request; Fieldbook does not retry with a larger budget or accept an incomplete search plan. Vercel AI Gateway's request settings are unchanged.

DO can infer model affinity from common prompts; hosted checks observed an earlier model selection persist after a pool edit until a fresh affinity identifier was used. Fieldbook sends a new random `X-Model-Affinity` for every planning and answer call, containing no user or session data. Each call sends its full context and can route independently. This deliberately gives up model-selection affinity reuse between requests, which may increase cost or latency; it does not opt out of underlying prompt caching or establish its effect on cache usage. After pool edits, verify the actual response model as well as the saved configuration. A fresh affinity identifier is not a propagation guarantee. See [DO's affinity behavior](https://www.digitalocean.com/blog/inference-router-cache-aware#explicitly-associate-requests-with-a-custom-http-header-x-model-affinity).

This baseline excludes implicit preset pools, dedicated endpoints and the automatic `inference-router` target because their complete eligible pools cannot be validated against these requirements. This is a compatibility boundary, not a claim that DO cannot route to them. Use a disposable single-model router configuration to isolate each model during compatibility checks, then restore and validate the intended full router policy before enabling Ask AI. Metadata validation does not prove that these tests ran or that routing/failover occurred. Models that reject these request settings or cannot complete within the bounds are outside this recipe's supported configuration.

In Admin → Ask AI, select the configured router. Pools and fallback policy are managed in DO, so Fieldbook does not offer its own fallback picker for this integration. Aggregate price, retention and training assurances are unknown; review every eligible model's current terms and rates in DO. Leave Ask AI off until real source-cited inference is checked. Vercel AI Gateway remains the default when `FIELDBOOK_AI_ROUTER` is omitted and retains its model/fallback experience.

### Acceptance and operating boundaries

Before relying on the DO installation, exercise real Google login and accounts (including preregistered, inactive and denied accounts), publication, saved progress, private signed reads, ordinary uploads and resumable uploads larger than 6 MiB. Verify unauthenticated access to private bytes is denied. Test optional AI/MCP as described above and scheduled deletion cleanup with disposable records. Never use existing production records as test fixtures without their operator's approval.

Restart Auth, REST, Storage and Fieldbook, then redeploy the same source/configuration and confirm saved accounts, content, progress, MCP refresh and private files remain usable. Resume a partially completed upload after Storage restarts. Apply a pending Fieldbook migration to a data-bearing test installation when a release has one; a fresh install alone proves no upgrade path. These checks can use a temporary restore or an existing authorized non-production installation; a permanent additional environment is not required.

For router validation, use synthetic prompts and inspect DO's response model and `x-model-router-selected-route` where available. Record what route was observed. Test fallback only through a controlled operator-owned test router/pool using DO-supported failure conditions; do not disable shared models or change production pools. Successful configuration or one successful answer does not establish failover. Disable Ask AI while changing eligible pools, recheck capabilities and actual tool/streaming behavior, update the verified-model attestation if needed, then re-enable.

The recipe deliberately departs from the [DO template](https://github.com/AppPlatform-Templates/supabase-appplatform) in component pins, least-privilege service roles, verified TLS, durable asymmetric keys, omitted unused services, Fieldbook's hook/cleanup, and the discovery/TUS ingress aliases. Keep those adjustments small and review them with upstream changes. See [upgrading and operations](upgrading.md) for independent application, database and backend updates, health checks, backups and recovery.
