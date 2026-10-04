# Deploy a Fieldbook instance

The repository root contains the installed server application. The optional `demo/` app uses synthetic browser-local data. Both use the same shared components; the installed app uses authenticated services and server persistence.

## Supported stack

This guide supports **Vercel and hosted Supabase, with Google sign-in**. Supabase is required by the current code: PostgreSQL alone does not replace its database API, Auth, Storage, OAuth server, and token hook. Other providers and self-hosted Supabase require their own adaptation and verification; this guide does not promise compatibility.

You need your own GitHub repository, Vercel account, Supabase project, and Google Cloud OAuth configuration. MCP is optional and may require an eligible AI-client plan. A custom domain and support mailbox are optional operator services.

The optional [Ask AI feature](ask-ai.md) is disabled by default and has separate model-router setup.

The [Vercel recipe](../deployment/vercel/README.md) summarizes host settings. Read [hosting and service providers](providers.md) for the code boundaries and contribution requirements. `FIELDBOOK_HOST` is optional: Vercel is detected automatically; ordinary local execution uses Node configuration. The backing services and Google sign-in remain the same.

## First deployment

Start with your own deployment repository at a chosen release; follow [versions and upgrades](upgrading.md). Before the first release, only development snapshots exist.

1. Create a dedicated **Supabase project** in your own account, directly or through the Vercel Marketplace. Choose a suitable region and plan. Each independent Fieldbook needs its own project; never reuse the maintainer's backend. Save any database password in your password manager.
2. Apply **every** `.sql` file in `supabase/migrations/` from the checked-out version, in filename order, to this new project. Run one file at a time in the Supabase SQL editor and record which ran. Do not stop at the first governance or search migration: the later feedback and five deletion/recovery migrations are also required. At this version the sequence includes the later roster import, added-at, team-deletion and deleted-person reactivation migrations through `20261003222648_roster_import_reactivation.sql`. Check the actual migration directory in the chosen revision rather than treating this sentence as a fixed endpoint. It also includes `20261002011512_ask_ai_passages.sql` for Ask AI retrieval. Earlier Organization membership, combined assignments and scoped MCP reporting migrations are required in filename order; apply the built-in Organization migration before Organization membership. The first migration creates the private `fieldbook-media` bucket; `20260927151228_deletion_schedule.sql` installs the hourly deletion job. These files are not designed to be run repeatedly. SQL-editor runs are not automatically tracked as CLI migrations; do not subsequently replay them through the CLI. For upgrades, back up first and apply only new migrations.
3. Create a Vercel project connected to **your own repository and chosen production branch**. Set **Root Directory** to the repository root (leave the field empty), use the Next.js preset, and `pnpm build`. Leave the output directory at the Next.js default; use Node.js 22.x and the pinned pnpm version. If you also want a demo, create a separate project rooted at `demo`, with shared files outside its root enabled; it is optional.
4. Connect the Supabase project to this hosting project, or enter its keys manually. The required variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Set `FIELDBOOK_APP_KIND=installed` for Vercel builds. Set `FIELDBOOK_URL` to the canonical HTTPS site origin and `FIELDBOOK_OWNER_EMAIL` to the exact Google email allowed to bootstrap administration. Do not put the secret key in any `NEXT_PUBLIC_` variable.
5. In Google Cloud, configure an OAuth web client. Its authorized redirect URI is `https://PROJECT_REF.supabase.co/auth/v1/callback`. Enable the Google provider in Supabase using that client's ID and secret. Configure Google's consent screen appropriately for public access; while in Testing mode, only configured test users can sign in.
6. In Supabase Auth URL configuration, set the Site URL to `FIELDBOOK_URL` and allow the exact application callback URL `FIELDBOOK_URL/auth/callback`. Do not add wildcard preview domains to the production allowlist. Supabase provider sign-up may create an Auth record, but Fieldbook's registration setting controls whether it gains application access.
7. Deploy and sign in as the configured owner. The first verified sign-in at that email creates the administrator profile. Other new users get learner profiles. No one can select their role in the browser.
8. **Complete the deletion worker setup before using Delete.** The migration installs its schedule but leaves its destination unset. In this installation's Supabase project, set `fb_cleanup_config.endpoint` to the full direct `https://HOST/api/internal/purge-deleted` URL on its canonical host, then verify an authenticated request and the scheduled job. Follow [deletion worker setup and checks](bulk-actions.md#install-or-upgrade-the-cleanup-worker). A redirecting address can lose the worker's Authorization header. Keep each preview backend pointed only at its own preview app; do not reuse production credentials or point it at this installation.
9. Create real content in `/admin`. Start with one draft article, one update, and one course; publish only after reviewing the editor, links, media and publication settings, then check the admitted-reader result. No demo data is seeded into this database. Administrators can assign Contributor access in People after applying the contributor permissions migration. See [roles and permissions](permissions.md) for the shared publishing panel and additive team management.

The included Vercel Analytics and Speed Insights SDKs turn on for Vercel deployments unless independently disabled. Enable Web Analytics in your own project and deploy after activation; standard Speed Insights uses the deployed SDK. See [activation, verification and opt-outs](../deployment/vercel/README.md#analytics-and-speed-insights).

Use a separate backend for previews that need real writes, or leave them unconfigured. Never connect an untrusted preview to the production database. An unconfigured production app fails to load data; it does not fall back to demo profiles.

Vercel does not run the SQL migrations automatically. Keep a private record of applied migrations and read the [upgrade guide](upgrading.md) before changing versions.

## MCP configuration

Follow the [MCP setup guide](mcp-setup.md) for client registration, callback URLs, ChatGPT/Claude setup, and troubleshooting. MCP is optional for browsing and admin editing.

The authenticated endpoint is `FIELDBOOK_URL/api/mcp`. It runs inside this Next.js deployment.

1. Enable Supabase Auth's **OAuth 2.1 Server**. Set the authorization/consent path to `/oauth/consent` under the application's Site URL. Prefer manual client registration with the exact callback URI supplied by the client. Leave dynamic registration off unless a chosen client requires it and you accept its registration exposure.
2. Enable the **Custom Access Token Hook** and select `public.fb_access_token_hook`. This hook is required: it binds approved clients' access-token audience to this Fieldbook's MCP URL. The MCP endpoint intentionally rejects tokens with the generic `authenticated` audience.
3. Configure asymmetric JWT signing keys if the project still uses legacy symmetric signing; the MCP endpoint verifies tokens through the project's published JWKS.
4. In ChatGPT or Claude, add the HTTPS MCP endpoint as a custom connection using OAuth. Sign in to Fieldbook as an administrator and approve the access described on the consent screen. Plan/workspace availability is controlled by the client provider.
5. Call `get_capabilities` to see the current account and connection grant, then verify the tools it actually permits. For a publisher, start with a disposable draft and verify revision conflicts and separate publication. For a scoped manager, verify named reports cannot escape managed teams. Test revocation and fresh consent for added capabilities.
6. Use `/connections` to revoke a client. Fieldbook checks its active grant on every request; revocation also removes the provider's OAuth grant and refresh tokens.

MCP uses the current Fieldbook role **and** the capabilities approved for that connection. Administrators can approve every supported capability; contributors can approve content, media and feedback tools; managers can approve named reports only for teams they explicitly manage. Learners have no MCP tools. New capabilities or promotion to administrator require renewed consent. The `prepare_media_upload` and `complete_media_upload` tools support verified private uploads when the client can transfer the bytes using the returned PUT/TUS instruction; otherwise upload in the editor and use `list_media`. A transfer URL is temporary and must never be stored as content. See [MCP setup](mcp-setup.md) and [permissions](permissions.md).

## Media and free-plan boundaries

Uploads go directly from an authorized publisher's browser to the private `fieldbook-media` bucket. The app issues a token for one random path, then verifies the uploaded object's metadata before accepting it. Supported formats: JPG, PNG, WebP, GIF, MP4, WebM. Fieldbook has no fixed per-file ceiling. The optional `FIELDBOOK_UPLOAD_MAX_BYTES` application limit and Supabase's global/bucket limits apply independently. The historical initial migration creates a 50 MB bucket limit; configure storage limits deliberately as described below. There is no transcoding, automatic captioning, or adaptive streaming; use browser-compatible H.264/AAC MP4 or WebM files.

### Configure upload limits

In Supabase **Storage settings**, choose the global file-size limit supported by your plan. In the private `fieldbook-media` bucket settings, raise its explicit file-size limit to the intended value or clear it to inherit the global limit. Keep the bucket private and its existing MIME restrictions. Free projects permit up to 50 MB globally; paid plans allow higher configured limits. Upgrading the account alone does not change an existing global or bucket limit. See [Supabase file limits](https://supabase.com/docs/guides/storage/uploads/file-limits).

For fresh installations, perform this storage configuration after applying the migration sequence. For existing installations, change these operator settings deliberately; no automatic limit change or new database migration is included in the upload code upgrade. Do not modify applied historical migration files. If `FIELDBOOK_UPLOAD_MAX_BYTES` is set, it remains an independent application restriction and must also allow the intended size. Leave it unset to rely on storage limits alone.

Files above 6 MiB use Supabase's signed TUS endpoint on the direct storage hostname and 6 MiB chunks; smaller files use direct signed PUTs. File bytes do not pass through a Vercel function. The current large-file transfer retries temporary failures from its confirmed offset, with bounded retry delays and no overwrite; it does not persist a resumable credential after the page closes. The server accepts a media reference only after verifying ownership and exact object size/MIME metadata. Test a representative larger file, storage rejection and interruption against an isolated Preview backend before production rollout. See [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

Published content may reference uploaded media. Guests receive short-lived signed URLs only for files referenced by published content; drafts require publishing access. Unpublishing stops new signed URLs, but an already-issued link can work for up to five minutes. Treat media published to a public site as public.

Check [current Supabase plan limits](https://supabase.com/pricing) and your host's limits before launch; free tiers are provider policies, not application guarantees. Free plans may pause inactive projects and do not supply the same backup/recovery guarantees as paid plans. Choose your own budget and alert settings. Arrange database exports and separate media backups before relying on the instance for important content; verify recovery rather than assuming a database export includes stored files.

## Implemented boundaries and remaining verification

- Public/private browsing and open/closed application registration are admin settings. Google credentials and the owner email are deployment settings.
- Database secrets remain server-only, including for administrators. Learner/guest responses exclude other users' profiles/progress, drafts and quiz answer keys; administrators have broader content/report access.
- Guest learning stays in browser storage. On sign-in, users can import it; answers are re-graded against the current course version. Browser data is not treated as a trusted quiz result. Changed/deleted courses can prevent import and retain the local records for review.
- Saves require a matching content revision. Draft and published snapshots are separate. Content writes and publication/unpublication are audited transactionally with the acting user and source.
- Tables and write functions deny direct `anon` and `authenticated` access. The Next.js server validates identity and permissions before using the service role.
- Published search uses indexed PostgreSQL retrieval with lesson coverage, prefixes and limited typo matching. Apply the search migration before deploying this version; see [search setup, behavior and limitations](search.md). Catalog and feedback reads paginate beyond database row caps; initial catalog loading still grows with library size. MCP search spans the authorized non-deleted library, including drafts for publishers; search and media listing return cursor pages with `nextCursor` and `complete`. Follow every page before treating a result as complete.
- People, flat learning groups and hierarchical teams are managed in Admin. Pre-register Google emails when registration is closed; no invitation email is sent. Managers can report only on explicitly managed teams and descendants. Groups assign courses without restricting published content visibility. Delete uses a 30-day recovery window; permanent deletion requires the separately configured [cleanup worker](bulk-actions.md#install-or-upgrade-the-cleanup-worker). See [roles and permissions](permissions.md). Dedicated enterprise integrations, a full WYSIWYG editor, and hosted multi-company SaaS are not supported.

Before calling the instance ready, verify the real Google redirect flow, a second learner account's permissions and cross-device progress, guest import, image/video upload and playback, draft-media protection, MCP OAuth from an actual supported client, token expiry/revocation, and a database export/restore. Local tests and successful builds alone do not verify these external integrations.

## Local development

Copy root `.env.example` to root `.env.local` and supply a dedicated development backend. From the repository root: `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm test`, `pnpm build`, and `pnpm build:demo`. Do not use production secrets for local tests or commit environment files.

## Configuration reference

Copy [`.env.example`](../.env.example). These values belong to your deployment, never to committed source:

| Variable                               | Meaning                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Your Supabase project URL                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Its publishable key; not an administrator credential                                    |
| `SUPABASE_SECRET_KEY`                  | Server-only project secret; never expose in browser code or an AI prompt                |
| `FIELDBOOK_URL`                        | One canonical origin, e.g. `https://learn.example.org`; no path                         |
| `FIELDBOOK_OWNER_EMAIL`                | Exact verified Google email that bootstraps the first administrator                     |
| `FIELDBOOK_UPLOAD_MAX_BYTES`           | Optional positive integer limit in bytes; blank/unset uses storage limits only. Invalid values reject signing. Configure global/bucket storage limits separately. |

Redeploy after changing deployment environment variables. The owner setting bootstraps a new profile; changing it does not transfer an existing administrator role or demote a previous administrator.

## Google branding and support email

The Google-to-Supabase callback and Supabase-to-Fieldbook callback are different URLs. Keep the provider callback from step 5 in Google and the app callback from step 6 in Supabase.

For a public installation, set the app name, public homepage and privacy link in Google Auth Platform. Verify your domain in Google Search Console using the project owner's account, change the audience from Testing to Production when ready, then verify and publish the branding. Public sign-in does not grant administrator access. Follow Google's current verification checks; naming the app alone does not display its verified name.

Google supports a non-Gmail support address registered as a Google account. Email can remain hosted by another provider. Sign in with that account and grant only the Google project permissions it needs (OAuth Config Editor worked for the initial deployment), then select the address in Branding. Account creation and Google Cloud may have separate terms. A custom mailbox is optional infrastructure for the operator; Fieldbook does not provision email or require Google Workspace.

Fieldbook’s own sign-in, consent and connection pages use the installation identity configured in **Organization Settings → Identity**. Name, optional welcome description and the published privacy link are shared with the application. Private visitors go directly to branded sign-in with their destination preserved; public visitors can keep browsing. No migration is required. See [installation branding](branding.md) for configuration.

Keep private developer notification contacts separate from the public support contact. An installation-specific policy is configured in Admin → Settings; see [privacy setup](privacy-setup.md). The maintainer's policy must not become your default.

Official references: [Google sign-in with Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google branding](https://support.google.com/cloud/answer/15549049), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Verification checklist

- [ ] Owner can sign in and manage content; a separate learner cannot access admin APIs or drafts.
- [ ] Public/private browsing and registration settings behave as chosen.
- [ ] A draft stays private; publication is visible to an admitted reader. On a public installation, check signed-out visibility; on a private one, check signed-out denial and signed-in visibility.
- [ ] Learner progress persists across devices; guest import works.
- [ ] Image and video upload/playback work; private draft media stays inaccessible to guests.
- [ ] Privacy link is public and accurate for this installation.
- [ ] If using MCP: a real AI client can create a draft; publication is explicit; revocation blocks subsequent calls.
- [ ] Database and media backups can be restored into an isolated environment.

For local development with Google sign-in, configure a dedicated development Supabase project's Site URL and allowed app callback for `http://127.0.0.1:3000`. Use the same origin in your local `FIELDBOOK_URL`; the Google provider callback still points to that development Supabase project. Remote AI services cannot reach a loopback MCP endpoint; use a separate HTTPS development deployment to test them.

## Isolated governance preview

Set `FIELDBOOK_ENVIRONMENT=preview` and `FIELDBOOK_PREVIEW_SUPABASE_REF` to the dedicated test project reference. Vercel preview deployments require the explicit reference and reject a different backend URL. Configure all five ordinary environment values using only the test backend and test origin. Run all migrations in filename order; the optional `supabase/fixtures/governance-preview.sql` is strictly for an empty isolated backend, not production or a migration. Enable its guard with `SET fieldbook.preview_seed = 'isolated-test-only';` in the same SQL session. Synthetic accounts have no sign-in credentials. Configure a dedicated Google OAuth client/callback for real test sign-ins; pre-register test users in Admin → People.

Learning group and curriculum upgrades require coordinated code/database deployment; see [learning groups](learning-groups.md).

## Troubleshooting handled request failures

Failed API responses include a `requestId` in the JSON body and `X-Request-Id` header. Save and upload messages include that reference. Search your server/function logs for the same ID in a `fieldbook_request_failed` event.

Events contain only the generated ID, a code-owned operation name (for example `api/content`), HTTP status, service category and an allowlisted provider code. They do not include request URLs/query strings, content, learner records, credentials, exception messages or stacks. An unrecognized code is recorded as `unavailable`. Review provider diagnostics in their protected dashboards when the safe event is insufficient; do not enable raw payload logging or paste sensitive provider output into bug reports.

- `configuration`: verify the required environment variables and, for a preview, its isolated backend configuration. Never point a preview at production to bypass this check.
- `auth`: identity verification failed or was rate-limited. Check provider availability and Auth configuration. Missing/expired sessions can be signed out; other provider failures are reported as unavailable.
- `database`: check connectivity, applied migrations and permissions. A `409` content/revision conflict instead means the author must review the latest saved copy.
- `application`: use the operation, status and reference to investigate; unexpected error details are withheld from public responses and logs.

These diagnostics cover handled browser API errors and the MCP HTTP boundary. MCP tool execution errors caught inside its SDK, platform-level failures before a handler, and direct browser-to-Storage failures do not necessarily have an application correlation ID. A network failure can also prevent the browser receiving one. See [content recovery](content-presentation.md#save-leave-and-recover) before retrying a save with an uncertain outcome.

## Guest recommendations

Public browsing works without a learning-group selection. To populate For you in Updates and Courses for signed-out visitors, optionally choose or explicitly create a learning group in Organization Settings → Access → Guest recommendations, then save settings. No new migration is required. See [configuration, privacy and verification](guest-recommendations.md).

## Reading pages

Published Docs, Updates and course overviews render on the server and follow the existing public/private setting. No new settings or migration are needed. Keep the supplied private/no-store cache policy when operating behind a CDN. See [reading architecture and verification](reading-pages.md).

## Recoverable deletion and scheduled cleanup

Content and user deletion requires the database recovery migrations and an hourly cleanup worker. Complete the endpoint configuration and first-run verification in [Bulk actions and recently deleted items](bulk-actions.md) for each environment. Applying the schema alone does not complete scheduler setup.

## Selecting the application for deployment

Set `FIELDBOOK_APP_KIND=installed` in each Vercel environment serving the root application. For an optional separate demo project rooted at `demo`, set `FIELDBOOK_APP_KIND=demo` and enable files outside its root. Vercel builds fail when the expected kind is missing or differs from the selected source. Local builds do not require it, but can set it to check their intended kind. Both package manifests pin Node22.

Each build emits `/fieldbook-build.json` with its app kind and available build revision. Verify this alongside routes and the actual deployment commit; it contains no credentials or installation data. Changing Root Directory alone does not prove a new build occurred.

For an existing installation using the old `production/` root and root demo, coordinate the two root changes with the source relocation. Keep serving domains on known-good deployments, prevent automatic domain assignment during the change window, then build each exact reviewed commit from its intended new root before separately promoting it. Preserve old deployment/configuration snapshots for rollback. Do not point an installed project at the old tree's root demo, or rebuild the old tree under the new roots. No database migration accompanies this directory move.

