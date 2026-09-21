# Deploy a Fieldbook instance

This is the server application. The repository root remains the browser-local demo. Both use the same components; this app substitutes authenticated services for demo persistence.

## Supported stack

This guide supports **Vercel and hosted Supabase, with Google sign-in**. Supabase is required by the current code: PostgreSQL alone does not replace its database API, Auth, Storage, OAuth server, and token hook. Other providers and self-hosted Supabase require their own adaptation and verification; this guide does not promise compatibility.

You need your own GitHub repository, Vercel account, Supabase project, and Google Cloud OAuth configuration. MCP is optional and may require an eligible AI-client plan. A custom domain and support mailbox are optional operator services.

## First deployment

Start with your own deployment repository at a chosen release; follow [versions and upgrades](../docs/upgrading.md). Before the first release, only development snapshots exist.

1. Create a dedicated **Supabase project** in your own account, directly or through the Vercel Marketplace. Choose a suitable region and plan. Each independent Fieldbook needs its own project; never reuse the maintainer's backend. Save any database password in your password manager.
2. Apply `supabase/migrations/202609190001_fieldbook.sql`, then `202609190002_mcp_audience.sql`, then `202609200001_governance.sql`, `202609200002_assignments.sql`, `202609200003_required_learning.sql`, and `202609200004_learning_groups.sql` from the repository root using the Supabase SQL editor or migrations CLI. The scripts are for a fresh database; they are not designed to be run repeatedly. The first migration also creates the private `fieldbook-media` bucket. Run them in order and record which ran. SQL-editor runs are not automatically tracked as CLI migrations; do not subsequently replay them through the CLI. For upgrades, back up first and apply only new migrations.
3. Create a Vercel project connected to **your own repository and chosen production branch**. Set **Root Directory** to `production`, enable shared files outside the root directory, use the Next.js preset, and `pnpm build`. Leave the output directory at the Next.js default; use Node.js 22.x and the pinned pnpm version. If you also want a demo, create a separate project rooted at the repository root; it is optional.
4. Connect the Supabase project to this hosting project, or enter its keys manually. The required variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Set `FIELDBOOK_URL` to the canonical HTTPS site origin and `FIELDBOOK_OWNER_EMAIL` to the exact Google email allowed to bootstrap administration. Do not put the secret key in any `NEXT_PUBLIC_` variable.
5. In Google Cloud, configure an OAuth web client. Its authorized redirect URI is `https://PROJECT_REF.supabase.co/auth/v1/callback`. Enable the Google provider in Supabase using that client's ID and secret. Configure Google's consent screen appropriately for public access; while in Testing mode, only configured test users can sign in.
6. In Supabase Auth URL configuration, set the Site URL to `FIELDBOOK_URL` and allow the exact application callback URL `FIELDBOOK_URL/auth/callback`. Do not add wildcard preview domains to the production allowlist. Supabase provider sign-up may create an Auth record, but Fieldbook's registration setting controls whether it gains application access.
7. Deploy and sign in as the configured owner. The first verified sign-in at that email creates the administrator profile. Other new users get learner profiles. No one can select their role in the browser.
8. Create real content in `/admin`. Start with one draft article, one field note, and one course; publish only after checking the previews. No demo data is seeded into this database.

Use a separate backend for previews that need real writes, or leave them unconfigured. Never connect an untrusted preview to the production database. An unconfigured production app fails to load data; it does not fall back to demo profiles.

Vercel does not run the SQL migrations automatically. Keep a private record of applied migrations and read the [upgrade guide](../docs/upgrading.md) before changing versions.

## MCP configuration

Follow the [MCP setup guide](../docs/mcp-setup.md) for client registration, callback URLs, ChatGPT/Claude setup, and troubleshooting. MCP is optional for browsing and admin editing.


The authenticated endpoint is `FIELDBOOK_URL/api/mcp`. It runs inside this Next.js deployment.

1. Enable Supabase Auth's **OAuth 2.1 Server**. Set the authorization/consent path to `/oauth/consent` under the application's Site URL. Prefer manual client registration with the exact callback URI supplied by the client. Leave dynamic registration off unless a chosen client requires it and you accept its registration exposure.
2. Enable the **Custom Access Token Hook** and select `public.fb_access_token_hook`. This hook is required: it binds approved clients' access-token audience to this Fieldbook's MCP URL. The MCP endpoint intentionally rejects tokens with the generic `authenticated` audience.
3. Configure asymmetric JWT signing keys if the project still uses legacy symmetric signing; the MCP endpoint verifies tokens through the project's published JWKS.
4. In ChatGPT or Claude, add the HTTPS MCP endpoint as a custom connection using OAuth. Sign in to Fieldbook as an administrator and approve the access described on the consent screen. Plan/workspace availability is controlled by the client provider.
5. Verify `search`, `fetch`, `create_content`, `update_content`, `publish_content`, `unpublish_content`, `content_report`, and `list_media`. Start with a disposable draft. Verify stale revisions are rejected and public content stays unchanged until publication.
6. Use `/connections` to revoke a client. Fieldbook checks its active grant on every request; revocation also removes the provider's OAuth grant and refresh tokens.

The AI can edit Markdown, lessons, and quizzes through the same service as the admin editor. Upload binary files through the app, then use `list_media` to reference them from MCP. MCP does not accept a service-role key or unauthenticated writes. The current tools are admin-only; learner and manager MCP access is not implemented.

## Media and free-plan boundaries

Uploads go directly from an authorized administrator's browser to the private `fieldbook-media` bucket. The app issues a token for one random path, then verifies the uploaded object's metadata before accepting it. Supported formats: JPG, PNG, WebP, GIF, MP4, WebM. The initial per-file ceiling is 50 MB. There is no transcoding, automatic captioning, or adaptive streaming; use browser-compatible H.264/AAC MP4 or WebM files.

Published content may reference uploaded media. Guests receive short-lived signed URLs only for files referenced by published content or the site logo; drafts require admin access. Unpublishing stops new signed URLs, but an already-issued link can work for up to five minutes. Treat media published to a public site as public.

Check [current Supabase plan limits](https://supabase.com/pricing) and your host's limits before launch; free tiers are provider policies, not application guarantees. Free plans may pause inactive projects and do not supply the same backup/recovery guarantees as paid plans. Choose your own budget and alert settings. Arrange database exports and separate media backups before relying on the instance for important content; verify recovery rather than assuming a database export includes stored files.

## Implemented boundaries and remaining verification

- Public/private browsing and open/closed application registration are admin settings. Google credentials and the owner email are deployment settings.
- Database secrets remain server-only, including for administrators. Learner/guest responses exclude other users' profiles/progress, drafts and quiz answer keys; administrators have broader content/report access.
- Guest learning stays in browser storage. On sign-in, users can import it; answers are re-graded against the current course version. Browser data is not treated as a trusted quiz result. Changed/deleted courses can prevent import and retain the local records for review.
- Saves require a matching content revision. Draft and published snapshots are separate. Content writes and publication/unpublication are audited transactionally with the acting user and source.
- Tables and write functions deny direct `anon` and `authenticated` access. The Next.js server validates identity and permissions before using the service role.
- Search and reporting are deliberately small-instance implementations, not dedicated search infrastructure. Catalog and feedback queries use the database API response limit (normally 1,000 rows); people and progress are retrieved through a server-scoped governance snapshot. MCP aggregate reports are also bounded; MCP search scans the 500 newest documents and returns at most 50 matches, and media listing returns 100 items.
- People, nested groups and teams are managed in Admin. Pre-register Google emails when registration is closed; no invitation email is sent. Managers can report only on explicitly managed teams and descendants. Groups assign courses without restricting published content visibility. See [roles and permissions](../docs/permissions.md). Dedicated enterprise integrations, a full WYSIWYG editor, and hosted multi-company SaaS are not supported.

Before calling the instance ready, verify the real Google redirect flow, a second learner account's permissions and cross-device progress, guest import, image/video upload and playback, draft-media protection, MCP OAuth from an actual supported client, token expiry/revocation, and a database export/restore. Local tests and successful builds alone do not verify these external integrations.

## Local development

Copy `.env.example` to `.env.local` in this directory and supply a dedicated development backend. From the repository root: `pnpm install`, `pnpm dev:production`, `pnpm test`, and `pnpm build:production`. Do not use production secrets for local tests or commit environment files.

## Configuration reference

Copy [`.env.example`](.env.example). These values belong to your deployment, never to committed source:

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Its publishable key; not an administrator credential |
| `SUPABASE_SECRET_KEY` | Server-only project secret; never expose in browser code or an AI prompt |
| `FIELDBOOK_URL` | One canonical origin, e.g. `https://learn.example.org`; no path |
| `FIELDBOOK_OWNER_EMAIL` | Exact verified Google email that bootstraps the first administrator |
| `FIELDBOOK_UPLOAD_MAX_BYTES` | Optional upload limit; keep at or below the bucket's configured limit (initially 50 MB) |

Redeploy after changing deployment environment variables. The owner setting bootstraps a new profile; changing it does not transfer an existing administrator role or demote a previous administrator.

## Google branding and support email

The Google-to-Supabase callback and Supabase-to-Fieldbook callback are different URLs. Keep the provider callback from step 5 in Google and the app callback from step 6 in Supabase.

For a public installation, set the app name, public homepage and privacy link in Google Auth Platform. Verify your domain in Google Search Console using the project owner's account, change the audience from Testing to Production when ready, then verify and publish the branding. Public sign-in does not grant administrator access. Follow Google's current verification checks; naming the app alone does not display its verified name.

Google supports a non-Gmail support address registered as a Google account. Email can remain hosted by another provider. Sign in with that account and grant only the Google project permissions it needs (OAuth Config Editor worked for the initial deployment), then select the address in Branding. Account creation and Google Cloud may have separate terms. A custom mailbox is optional infrastructure for the operator; Fieldbook does not provision email or require Google Workspace.

Keep private developer notification contacts separate from the public support contact. An installation-specific policy is configured in Admin → Settings; see [privacy setup](../docs/privacy-setup.md). The maintainer's policy must not become your default.

Official references: [Google sign-in with Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google branding](https://support.google.com/cloud/answer/15549049), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Verification checklist

- [ ] Owner can sign in and manage content; a separate learner cannot access admin APIs or drafts.
- [ ] Public/private browsing and registration settings behave as chosen.
- [ ] A draft stays private; publication is visible in a signed-out browser.
- [ ] Learner progress persists across devices; guest import works.
- [ ] Image and video upload/playback work; private draft media stays inaccessible to guests.
- [ ] Privacy link is public and accurate for this installation.
- [ ] If using MCP: a real AI client can create a draft; publication is explicit; revocation blocks subsequent calls.
- [ ] Database and media backups can be restored into an isolated environment.

For local development with Google sign-in, configure a dedicated development Supabase project's Site URL and allowed app callback for `http://127.0.0.1:3000`. Use the same origin in your local `FIELDBOOK_URL`; the Google provider callback still points to that development Supabase project. Remote AI services cannot reach a loopback MCP endpoint; use a separate HTTPS development deployment to test them.

## Isolated governance preview

Set `FIELDBOOK_ENVIRONMENT=preview` and `FIELDBOOK_PREVIEW_SUPABASE_REF` to the dedicated test project reference. Vercel preview deployments require the explicit reference and reject a different backend URL. Configure all five ordinary environment values using only the test backend and test origin. Run all migrations in filename order; the optional `supabase/fixtures/governance-preview.sql` is strictly for an empty isolated backend, not production or a migration. Enable its guard with `SET fieldbook.preview_seed = 'isolated-test-only';` in the same SQL session. Synthetic accounts have no sign-in credentials. Configure a dedicated Google OAuth client/callback for real test sign-ins; pre-register test users in Admin → People.

Learning group and curriculum upgrades require coordinated code/database deployment; see [learning groups](../docs/learning-groups.md).
