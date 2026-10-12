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

This recipe keeps Supabase's Auth, database API and Storage services while running them on DigitalOcean. It uses a Marketplace Supabase server, DO managed PostgreSQL and an App Platform gateway that exposes only the backend API. Fieldbook continues to use the Supabase provider implementation. It does not require a Supabase Cloud subscription.

Choose resource sizes for your expected workload in DigitalOcean. Configure spend alerts before creating paid resources. Inference prepaid balances can stop inference when exhausted; other infrastructure continues accruing charges. Review credits, both prepaid balances and auto-reload settings. Spending controls and temporary deployment restrictions belong in your account and operating configuration.

### Prepare the backend

1. Create an isolated installation using the [DO Supabase Marketplace image](https://docs.digitalocean.com/products/marketplace/catalog/supabase/). Follow its managed-database setup with PostgreSQL 17 or later. The `service_role` database role must have `BYPASSRLS`; keep this privileged role and its API key server-only.
2. Keep the Supabase API reachable through the installation's private network. Restrict database trusted sources to the Supabase server. Keep Studio and infrastructure administration private.
3. Wait for Auth and Storage to initialize. On the new, unused backend, run [.do/prepare-supabase-backend.sql](../.do/prepare-supabase-backend.sql) as the cluster administrator, then restart Auth and Storage. It configures their schema paths and Storage's standard role permissions. If the Marketplace bootstrap placed Auth's migration ledger in `public`, it preserves that history in `auth`. It refuses a backend with users or an installed Fieldbook schema. If Storage cannot verify the database certificate, mount the cluster's CA certificate into its container and set `NODE_EXTRA_CA_CERTS` to that path. Preserve certificate verification.
4. For media stored in Spaces, configure Supabase Storage's [S3 backend](https://supabase.com/docs/guides/self-hosting/self-hosted-s3) with your private bucket, region endpoint and bucket-scoped credentials. The bucket stays private; Fieldbook uses the Storage API to issue upload and read permissions. This preserves its existing upload interface.

The Marketplace image includes `utils/add-new-auth-keys.sh`. Run it in the backend's Docker directory with `--update-env`, using Node.js 22, to generate asymmetric signing and verification keys. Its output contains secrets; save it privately. Copy [.do/supabase-fieldbook.compose.yaml](../.do/supabase-fieldbook.compose.yaml) into that directory as `docker-compose.fieldbook.yml`. This override propagates the keys, trusted database certificate, Google configuration, MCP settings and Spaces credentials to the appropriate services.

Add these installation values to the backend's private `.env`: `FIELDBOOK_URL`, `FIELDBOOK_PUBLIC_SUPABASE_URL` (the app URL followed by `/backend`), `FIELDBOOK_SPACES_BUCKET`, `FIELDBOOK_SPACES_REGION`, `FIELDBOOK_SPACES_ACCESS_KEY` and `FIELDBOOK_SPACES_SECRET_KEY`. Store the cluster's CA at `volumes/certificates/digitalocean-ca.pem`. For Google, set `GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID` and `GOOGLE_SECRET` after creating the client. Set `FIELDBOOK_MCP_ENABLED=true` when enabling MCP. Restart the services with the image's base, managed-database and Fieldbook overrides:

```sh
docker compose -f docker-compose.yml -f docker-compose.dbaas.yml -f docker-compose.fieldbook.yml up -d
```

### Configure App Platform

Use [.do/app.yaml](../.do/app.yaml) as the app specification. Replace the repository, deployment branch, VPC, private backend address and credentials with your own settings. Select component sizes and instance counts before creating the app. Review automatic deployment settings for your chosen source connection.

The app contains:

- **Fieldbook:** the standalone Next.js application built by [Dockerfile](../Dockerfile).
- **Backend gateway:** [Dockerfile.supabase-gateway](../Dockerfile.supabase-gateway) exposes Supabase API routes through App Platform's HTTPS address. `/backend` routes to this component; Studio is not exposed. Its `FIELDBOOK_SUPABASE_INTERNAL_URL` points to the private Supabase API.
- **Cleanup:** a scheduled job built by [Dockerfile.cleanup](../Dockerfile.cleanup) that posts to the installed cleanup endpoint hourly. See the database setup below for its credential.

Configure the same installation variables as the Vercel recipe, using `FIELDBOOK_HOST=node`. With the example gateway, `NEXT_PUBLIC_SUPABASE_URL` is `https://YOUR-APP-HOST/backend` and `FIELDBOOK_URL` is `https://YOUR-APP-HOST`. App Platform's `${APP_URL}` binding can supply these values. Supply public Supabase values during both build and runtime; Next.js embeds public environment values at build time. Server-only keys must be secret environment variables.

For the Marketplace Kong configuration, use its `.env` `ANON_KEY` as Fieldbook's public Supabase key and `SERVICE_ROLE_KEY` as its server key. Keep the server key private. The gateway restores `/backend` in resumable upload redirects as well as routing ordinary API requests. Verify a transfer larger than 6 MiB before relying on video uploads.

Keep the app connected to the backend VPC. Use a custom hostname and disable App Platform edge caching so authenticated responses and streamed AI/MCP responses pass through correctly. Add the hostname's CNAME at your existing DNS provider using the target returned by DO; domain registration and nameservers can stay with their current provider. DO requires a custom hostname for this caching setting. For a preview, set `FIELDBOOK_ENVIRONMENT=preview` and `FIELDBOOK_PREVIEW_SUPABASE_URL` to the exact isolated HTTPS backend URL. Hosted Supabase previews can continue using `FIELDBOOK_PREVIEW_SUPABASE_REF`.

### Install the application schema

The self-hosted installer uses the released migrations and delegates HTTP cleanup scheduling to the host. It leaves the released baseline file unchanged. It requires Supabase's initialized Auth and Storage schemas and refuses an existing configured installation, records or unrelated application tables.

From the matching source checkout, install locked dependencies, then set `FIELDBOOK_SETUP_DATABASE_URL`, `FIELDBOOK_SETUP_DATABASE_CA` (the cluster CA certificate path) and `FIELDBOOK_URL` in a private environment file. Run from a location authorized by the database's trusted sources:

```sh
node --env-file=.env.local scripts/setup-self-hosted.mjs
```

Confirm the displayed target by typing `SETUP`. The installer applies the schema and records migration versions in one transaction. It does not reset a data-bearing database. The original `setup-database.mjs` command remains the hosted Supabase setup path.

Read the new backend's `fb_cleanup_config.secret` through an authorized database connection and store it as the cleanup job's server-only `FIELDBOOK_CLEANUP_SECRET`. Never put it in public source. Configure the hourly job and verify a successful run; this backend does not use `pg_net` to schedule HTTP cleanup.

### Configure sign-in, MCP and inference

Configure Google in self-hosted Supabase Auth using its version-matched environment settings. The Google redirect URI is the public backend callback, for example `https://YOUR-APP-HOST/backend/auth/v1/callback`. Auth's Site URL is `FIELDBOOK_URL`; allow `FIELDBOOK_URL/auth/callback` as its application redirect. Sign in as `FIELDBOOK_OWNER_EMAIL` to create the first administrator.

For MCP, enable Supabase's OAuth server and client-registration support, set its authorization path to `/oauth/consent`, configure asymmetric signing keys and enable Fieldbook's `fb_access_token_hook` as the custom access-token hook. The OAuth issuer must match the public backend's `/auth/v1` address. With the Marketplace Kong gateway, add the definitions in [.do/supabase-oauth-routes.yaml](../.do/supabase-oauth-routes.yaml) under its existing `services` list and restart Kong. These endpoints rely on Supabase Auth's client and session authentication. Keep the other API and administration routes protected. The App Platform gateway also serves the standard discovery path for the `/backend/auth/v1` issuer. Verify discovery, authorization, refresh, revocation and Fieldbook's connection permissions with the clients you intend to use.

For DO inference, configure:

```text
FIELDBOOK_AI_ROUTER=digitalocean
DIGITALOCEAN_MODEL_ACCESS_KEY=YOUR_SERVER_ONLY_MODEL_ACCESS_KEY
DIGITALOCEAN_AI_MODELS=YOUR_TOOL_CAPABLE_TEXT_MODEL_IDS
```

Use a model access key with appropriate model permissions. Foundation-model and inference-router permissions are separate; review both when creating the key. Declare compatible text model IDs separated by commas; Fieldbook verifies their presence in the inference catalog. The catalog does not expose tool capabilities, pricing or privacy assurances, so review them in DigitalOcean. In Ask AI settings, select the DO model and set fallback to None. Router choice is independent of hosting; Vercel AI Gateway remains available through `FIELDBOOK_AI_ROUTER=vercel`.

Before admitting users, verify real sign-in, publishing, learner progress, private uploads and reads, a source-cited AI answer if enabled, MCP permissions if enabled, and an accepted cleanup run. See [upgrading](upgrading.md) for existing installations. Application deployment does not apply database changes.
