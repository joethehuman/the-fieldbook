# Install The Fieldbook

Choose a recipe for your own accounts and infrastructure. Both run the same Fieldbook application, use Google sign-in, and keep media private. Use Node.js 22 and pnpm 10.17.1 for the source checkout.

## Installation recipes

| Recipe                                                      | Application  | Backend and files                                                           |
| ----------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| [Vercel with hosted Supabase](#vercel-with-hosted-supabase) | Vercel       | Hosted Supabase Database, Auth and Storage                                  |
| [DigitalOcean App Platform](#digitalocean-app-platform)     | App Platform | Managed PostgreSQL, App Platform Supabase Auth/REST/Storage, private Spaces |

Vercel with hosted Supabase is the released configuration. The DigitalOcean recipe has not yet shipped in a Fieldbook release. Its component versions and configuration are listed below.

## Vercel with hosted Supabase

### 1. Get the source and create a Supabase project

Copy or fork [the Fieldbook repository](https://github.com/joethehuman/the-fieldbook) into your own GitHub account. Choose a release tag or commit and keep a local copy of that same source version. Your repository and deployment branch control when you take updates. Preserve the ELv2 license and third-party notices.

Create a dedicated, empty hosted Supabase project. Note its project reference, project URL, publishable key and server-only secret key. Keep its database password and credentials secure. For an existing Fieldbook database, follow [upgrading](upgrading.md).

### 2. Configure Vercel

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

### 3. Set up the database

From the root of your local source copy, with Node.js 22, run:

```sh
node scripts/setup-database.mjs
```

Enter the Supabase project reference and deployed Fieldbook HTTPS address. Confirm the target by typing `SETUP`. Open the Supabase login link in your browser and complete verification when prompted.

The command downloads a pinned Supabase CLI, applies the database migrations, creates the private media bucket and connects hourly deletion cleanup. No separate CLI installation, Docker or individual SQL commands are needed.

The cleanup route must be reachable without Vercel deployment protection. Fieldbook's members-only browsing setting does not block this route.

If the database migrations finished but the final cleanup connection failed, rerun the same command. It can finish an unused installation with matching migrations and no configured cleanup endpoint. It refuses configured installations, existing content, people or media, and unrelated application tables. If a migration itself failed, read the Supabase error before retrying; do not reset a database with data.

### 4. Configure Google sign-in

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

### 5. Start using Fieldbook

Open **Manage organization → Access** and choose public or members-only browsing and open or closed registration. A new installation defaults to public browsing and open registration. Closed registration requires preregistering a person's Google email in **People**; no invitation email is sent.

Create and publish your first content, then open it as a reader. A new database has no demo content. Installation name, home page, privacy notice, teams, learning audiences and due dates can be configured as needed.

The media bucket stays private. Upload size depends on your storage provider and bucket settings; Fieldbook adds a size limit only if you set `FIELDBOOK_UPLOAD_MAX_BYTES`. Supported uploads are JPG, PNG, WebP, GIF, MP4 and WebM. Fieldbook does not transcode video.

Deleted content and accounts have a 30-day recovery window, followed by hourly permanent cleanup. If cleanup needs attention, **Recently deleted** shows the operator warning.

### Optional services and development

- **Ask AI:** off by default; [configure it](https://www.thefieldbook.org/docs/02dbd607-82c5-46ed-9877-debc2c24538a) if you want generated answers from published content.
- **MCP:** [configure authorization and an AI client](https://www.thefieldbook.org/docs/76be7ee8-371d-4ed0-b57f-1277460df3fe) if publishing or reporting accounts need external AI tools.
- **Privacy notice:** host a notice in Fieldbook or link to an existing one if you choose to publish one.
- **Backups:** choose your own recovery arrangements. Supabase's [database backup options](https://supabase.com/docs/guides/platform/backups) depend on the plan; database backups do not include uploaded Storage file bytes.
- **Previews:** optional. Use a separate Supabase project and Google configuration. Vercel detects preview deployments automatically; set `FIELDBOOK_PREVIEW_SUPABASE_REF` to that backend's reference alongside its credentials. The app checks that its URL matches the declared reference. Keep production credentials out of previews.
- **Local development:** copy `.env.example` to `.env.local` with a dedicated development backend. Set `FIELDBOOK_URL=http://127.0.0.1:3000` and allow that origin's `/auth/callback` in Supabase. Run `pnpm install --frozen-lockfile` and `pnpm dev`.
- **Demo:** `pnpm dev:demo` runs fictional browser-local data without a backend. It is a separate optional app and does not provision an installation.

## DigitalOcean App Platform

This recipe runs Fieldbook and Supabase Auth, REST/PostgREST and Storage on App Platform. Managed PostgreSQL stores the database; private Spaces stores uploaded files. It uses Google sign-in and an optional DigitalOcean Inference Router. No hosted Supabase account or separate gateway is required.

### Pinned components and compatibility

The tested configuration uses PostgreSQL 17, one Fieldbook instance, and the component images pinned by tag and digest in the repository's Dockerfiles. Further PostgreSQL majors, independently mixed backend versions and multiple Fieldbook instances need a compatibility review.

| Component                 | Tested version                                                      |
| ------------------------- | ------------------------------------------------------------------- |
| Fieldbook runtime         | Node 22.23.3, pnpm 10.17.1, locked Next.js 16.3.8                   |
| Supabase Auth             | `supabase/gotrue:v2.197.0`                                          |
| PostgREST                 | `postgrest/postgrest:v16.4`                                         |
| Supabase Storage          | `supabase/storage-api:v1.81.1`                                      |
| Managed PostgreSQL        | 17.11; DO maintains minor versions                                  |
| Optional inference models | `openai-gpt-oss-20b`, `openai-gpt-oss-120b` through a custom router |

The configuration starts from the [Supabase self-hosting snapshot at `cb4307f`](https://github.com/supabase/supabase/tree/cb4307f15b99e02a8a56e103086d1eab72eb9e9a/docker). Compared with the [DigitalOcean template](https://github.com/AppPlatform-Templates/supabase-appplatform), it uses the pins above, separate service database roles, verified database TLS, durable signing keys, Fieldbook's token hook and cleanup job, and the ingress aliases described below. Studio, Realtime, Edge Functions and a gateway are omitted. A startup wrapper writes the database CA to a private temporary file; the PostgREST image also includes a pinned static BusyBox shell for that wrapper.

### 1. Prepare the source, database and private files

Copy or fork [the repository](https://github.com/joethehuman/the-fieldbook) and select the source version you want to run. With Node.js 22 and pnpm 10.17.1, install its dependencies:

```sh
pnpm install --frozen-lockfile
```

Create a dedicated, empty Managed PostgreSQL **17** database and a private Spaces bucket. Put the app and database in the same intended VPC and region. The example uses App Platform region `sfo` and database `defaultdb`; update the region, database attachment and service URLs if yours differ.

Download the database CA certificate. Use its **private/VPC DNS hostname** in the three backend service connection URLs. The local setup connection can use the public DNS endpoint, with your operator connection added to trusted sources. Use direct database connections, not a transaction pooler.

Create Spaces credentials scoped to the bucket with read, write and delete access. Keep its ACL private and its public CDN off. The Storage service supplies authorized file access.

Generate durable keys in an existing private directory outside the repository:

```sh
node scripts/generate-self-hosted-keys.mjs --output /private/path/fieldbook-keys.env
```

The command creates an ES256 signing key, a Storage signing secret, JWT API keys and three separate service database passwords. It refuses to overwrite an existing file. Keep these values across restarts and redeployments and include them in your configuration backup. The generated API keys expire after five years.

Create a separate private setup file containing:

```text
FIELDBOOK_SETUP_DATABASE_URL=postgresql://doadmin:YOUR_PASSWORD@YOUR_DATABASE_DNS:25060/defaultdb
FIELDBOOK_SETUP_DATABASE_CA=/private/path/cluster-ca.crt
FIELDBOOK_URL=https://learn.example.org
```

Then prepare the empty backend:

```sh
node --env-file=/private/path/database.env --env-file=/private/path/fieldbook-keys.env scripts/prepare-digitalocean.mjs
```

Check the displayed target and type `PREPARE`. The command creates the required roles, schemas and helpers with independent service passwords. Auth and Storage create their own tables when they start. This command is for a fresh backend, not an upgrade or restore. Keep the administrator connection out of running services.

### 2. Configure the app spec and hostname

Copy [.do/app.yaml](../.do/app.yaml) into a private operator workspace and replace every `YOUR_` placeholder: source repository and branch, VPC, database attachment and DNS, service passwords, Spaces, Google credentials, owner email and hostname. Keep populated specs and secret files outside Git.

Choose service sizes for your workload. The example uses one instance per service and a connection pool of five for each backend component. Database capacity also needs room for background connections and old/new instances overlapping during deployment.

Map the generated keys as follows:

| Generated value         | Component variables                                                  |
| ----------------------- | -------------------------------------------------------------------- |
| `ANON_KEY`              | Fieldbook `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; Storage `ANON_KEY` |
| `SERVICE_ROLE_KEY`      | Fieldbook `SUPABASE_SECRET_KEY`; Storage `SERVICE_KEY`               |
| `JWT_SECRET`            | Auth `GOTRUE_JWT_SECRET`; Storage `AUTH_JWT_SECRET`                  |
| `JWT_KEYS`              | Auth `GOTRUE_JWT_KEYS`                                               |
| `JWT_JWKS`              | REST `PGRST_JWT_SECRET`; Storage `JWT_JWKS`                          |
| Three service passwords | Their matching Auth, REST and Storage connection URLs                |

`JWT_JWKS` includes a symmetric verification secret and is server-only. This recipe uses the generated JWT `ANON_KEY` and `SERVICE_ROLE_KEY`, rather than hosted Supabase's opaque API keys.

Give server secrets runtime-only secret scope. The two `NEXT_PUBLIC_SUPABASE_` values need `RUN_AND_BUILD_TIME` scope. Set `NEXT_PUBLIC_SUPABASE_URL` to the **literal** canonical HTTPS origin followed by `/backend`, such as `https://learn.example.org/backend`. Dockerfile build arguments cannot resolve runtime `${APP_URL}` bindings. Rebuild Fieldbook if that public backend address changes. See [DO's environment-variable guidance](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/#set-build-time-variables-for-dockerfiles).

Use a primary custom HTTPS hostname and keep `disable_edge_cache: true`. Add its CNAME at your DNS provider using DO's assigned target; changing nameservers is not required. Runtime `${APP_URL}` and `FIELDBOOK_URL` must resolve to that canonical origin.

### 3. Bootstrap the app's private database connection

For the first deployment, retain only **Fieldbook** and its `/` ingress rule from the populated spec. Keep the VPC, database attachment, hostname and final public Supabase variables; omit Auth, REST, Storage, cleanup and their ingress rules for now.

Deploy that same app. Its `/fieldbook-build.json` health check works before the backend is available; the ordinary interface does not yet work.

Read the app's `vpc.egress_ips` from its Networking information or the app API. Add those exact private addresses to the database's trusted sources. Selecting the app itself as a trusted source does not authorize this private path. Recheck the addresses after network or component changes. See [DO's VPC guidance](https://docs.digitalocean.com/products/app-platform/how-to/enable-vpc/).

### 4. Add the backend and Google sign-in

Add Auth, REST, Storage and their ingress rules from the populated spec, retaining the same app. Leave cleanup out until the next step. Initially keep signup, the custom token hook and the OAuth server disabled as specified in the example.

All three backend database connections use `sslmode=verify-full` and the downloaded CA. Storage also receives the CA PEM through `DATABASE_SSL_ROOT_CERT` for its tenant pool. Use a certificate-matching DNS hostname, not an IP address, and retain certificate verification.

Keep these public routes from the spec:

| Public path                                               | Component routing                                          |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `/backend/auth/v1`                                        | Auth, stripping the prefix                                 |
| `/backend/rest/v1`                                        | PostgREST, stripping the prefix                            |
| `/backend/storage/v1`                                     | Storage, stripping the prefix                              |
| `/.well-known/oauth-authorization-server/backend/auth/v1` | Auth's OAuth discovery route                               |
| `/upload/resumable`                                       | Storage, preserving the prefix returned in TUS upload URLs |
| `/`                                                       | Fieldbook                                                  |

These routes cover OAuth discovery and subsequent resumable-upload requests as well as the initial API request. `STORAGE_PUBLIC_URL` uses the canonical origin; forwarded-prefix interpretation remains off.

Retain `UPLOAD_SIGNED_URL_EXPIRATION_TIME=7200` and `TUS_URL_EXPIRY_MS=7200000`. They give uploads a two-hour authorization window. After authorization expires, choose the file again; saved partial bytes do not extend permission. Storage's `FILE_SIZE_LIMIT` is an operator setting; the example uses 5 GiB. Fieldbook's optional `FIELDBOOK_UPLOAD_MAX_BYTES` can impose a smaller application limit.

In Google Cloud, configure an OAuth **Web application** client with the Fieldbook origin and this redirect URI:

```text
https://YOUR-FIELDBOOK-HOST/backend/auth/v1/callback
```

Use the basic `openid`, email and profile scopes. Google's [audience guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) describes its account and publishing settings.

Auth's external URL and JWT issuer are `FIELDBOOK_URL/backend/auth/v1`; its Site URL is `FIELDBOOK_URL` and its application redirect allowlist is `FIELDBOOK_URL/auth/callback`. The spec disables email/password, phone and anonymous signups. Keep `GOTRUE_DISABLE_SIGNUP=true` until Fieldbook setup completes.

Wait for Auth `/health`, Storage `/status` and internal PostgREST `:3001/ready`. Confirm the Auth and Storage tables and their migration ledgers exist before installing Fieldbook.

### 5. Install Fieldbook and connect cleanup

With the private setup file from step 1, run:

```sh
node --env-file=/private/path/database.env scripts/setup-self-hosted.mjs
```

Check the target and type `SETUP`. The command applies the released baseline and any later Fieldbook migrations, recording them in `supabase_migrations.schema_migrations`. It retains the shared application SQL and substitutes external cleanup scheduling for the hosted `pg_cron`/`pg_net` schedule. It refuses an installation with existing accounts, content or files.

After setup, set Auth's `GOTRUE_DISABLE_SIGNUP=false` and `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true`. Retain the configured hook URI `pg-functions://postgres/public/fb_access_token_hook`.

Read the generated worker credential through your private administrator database connection:

```sql
select secret from public.fb_cleanup_config where id = true;
```

Set it as the cleanup job's runtime-only secret `FIELDBOOK_CLEANUP_SECRET`. Add the hourly job from the app spec and deploy the updated configuration. Preserve its URL, secret and schedule through subsequent updates. Check that the job succeeds and that its next scheduled run is accepted; **Recently deleted** also reports cleanup health.

### 6. Start using Fieldbook

Sign in with `FIELDBOOK_OWNER_EMAIL` to create the first administrator. Changing that variable later does not transfer ownership. In **Manage organization → Access**, choose browsing and registration settings. Closed registration uses preregistered Google emails in **People**.

Create and publish content, read it, save course progress and upload a representative file. Ordinary uploads and resumable uploads above 6 MiB use the same private Storage service. A public installation admits guests to published content through Fieldbook; it does not make the Spaces bucket public.

For an optional isolated preview, set `FIELDBOOK_ENVIRONMENT=preview` and `FIELDBOOK_PREVIEW_SUPABASE_URL` to its exact backend URL. Keep preview credentials separate from production. See [upgrading and operations](upgrading.md) for application updates, migrations, backend updates and recovery.

### Optional MCP

Enable Auth's `GOTRUE_OAUTH_SERVER_ENABLED` and retain `/oauth/consent` as its authorization path, the custom access-token hook, and the original asymmetric signing keys. Enable `GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION` if your client requires dynamic registration; otherwise register its exact callback and authentication method manually through the Auth API.

Connect the client to `https://YOUR-FIELDBOOK-HOST/api/mcp`. Each person separately approves the connection capabilities their current role permits. Human Google sign-in alone does not authorize MCP. Confirm discovery, consent and a relevant authenticated operation in the client you intend to use. See [Set up MCP](https://www.thefieldbook.org/docs/76be7ee8-371d-4ed0-b57f-1277460df3fe) and the [tool contract](mcp-contract.json).

### Optional DigitalOcean Inference Router

Configure a custom [Inference Router](https://docs.digitalocean.com/products/inference/how-to/use-inference-router/) in DigitalOcean with explicit model pools and fallback order. Model choices, routing, provider terms and service charges belong to your DigitalOcean configuration. Fieldbook uses that router and does not administer it.

Set these variables on Fieldbook:

```text
FIELDBOOK_AI_ROUTER=digitalocean
DIGITALOCEAN_INFERENCE_ROUTER=router:fieldbook
DIGITALOCEAN_VERIFIED_MODELS=openai-gpt-oss-20b,openai-gpt-oss-120b
DIGITALOCEAN_MODEL_ACCESS_KEY=YOUR_ROUTER_SCOPED_MODEL_ACCESS_KEY
DIGITALOCEAN_ROUTER_READ_TOKEN=YOUR_SEPARATE_GENAI_READ_TOKEN
```

Use your router's exact `router:<name>` target. Every policy must name its models, with at least one explicit fallback model. Automatic `inference-router` targets, implicit preset pools and dedicated endpoints are outside this configuration.

The tested models are listed above. `DIGITALOCEAN_VERIFIED_MODELS` must cover every pool and fallback model you have checked for forced tool calling and streamed Chat Completions. Additional models need those checks before being included. Fieldbook also checks their current serverless text and `tool_calling` metadata; a catalog entry alone does not verify an inference request.

Create a [model access key](https://docs.digitalocean.com/products/inference/how-to/manage-model-access-keys/) restricted to the router **and** its explicit pool/fallback models. Leaving the foundation-model selection empty can grant **All models**, even with a router selected; check the resulting scope. For discovery, use a separate API token with `genai:read` and the required read-only dependencies `regions:read`, `sizes:read` and `actions:read`. Keep both credentials server-side and deployment/router-write credentials outside Fieldbook.

Redeploy, then open **Manage organization → Ask AI**. The Routing section shows the configured router, model pools and fallback order. If its saved target differs, choose **Use configured router** and save. Select published sources and answer guidance, enable the feature, and check a real answer and its citation. Pool and fallback changes stay in DigitalOcean; opening the settings page does not run inference.
