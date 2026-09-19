# Fieldbook personal production setup

This is the server application. The repository root remains the browser-local demo. Both use the same components; this app substitutes authenticated services for demo persistence.

## First deployment

1. Create a **free Supabase project**. A resource named `fieldbook-production` was provisioned through the existing Vercel integration during initial setup. Do not create another without checking that resource first.
2. Apply `supabase/migrations/202609190001_fieldbook.sql`, then `202609190002_mcp_audience.sql` from the repository root using the Supabase SQL editor or migrations CLI. The scripts are for a fresh database; they are not designed to be run repeatedly.
3. Create a separate Vercel project connected to this repository. Set **Root Directory** to `production`, enable shared files outside the root directory, use the Next.js preset, and `pnpm build`. Keep the existing demo project connected to the repository root.
4. Connect only the new Supabase resource to this production project. The integration supplies `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Set `FIELDBOOK_URL` to the canonical HTTPS site origin and `FIELDBOOK_OWNER_EMAIL` to the exact Google email allowed to bootstrap administration. Do not put the secret key in any `NEXT_PUBLIC_` variable.
5. In Google Cloud, configure an OAuth web client. Its authorized redirect URI is `https://PROJECT_REF.supabase.co/auth/v1/callback`. Enable the Google provider in Supabase using that client's ID and secret. Configure Google's consent screen appropriately for public access; while in Testing mode, only configured test users can sign in.
6. In Supabase Auth URL configuration, set the Site URL to `FIELDBOOK_URL` and allow the exact application callback URL `FIELDBOOK_URL/auth/callback`. Do not add wildcard preview domains to the production allowlist. Supabase provider sign-up may create an Auth record, but Fieldbook's registration setting controls whether it gains application access.
7. Deploy and sign in as the configured owner. The first verified sign-in at that email creates the administrator profile. Other new users get learner profiles. No one can select their role in the browser.
8. Create real content in `/admin`. Start with one draft article, one field note, and one course; publish only after checking the previews. No demo data is seeded into this database.

Use a separate backend for previews that need real writes, or leave them unconfigured. Never connect an untrusted preview to the production database. An unconfigured production app fails to load data; it does not fall back to demo profiles.

## MCP configuration

The authenticated endpoint is `FIELDBOOK_URL/api/mcp`. It runs inside this Next.js deployment.

1. Enable Supabase Auth's **OAuth 2.1 Server**. Set the authorization/consent path to `/oauth/consent` under the application's Site URL. Enable dynamic client registration if the connecting client requires it, or pre-register a client using its documented redirect URI.
2. Enable the **Custom Access Token Hook** and select `public.fb_access_token_hook`. This hook is required: it binds approved clients' access-token audience to this Fieldbook's MCP URL. The MCP endpoint intentionally rejects tokens with the generic `authenticated` audience.
3. Configure asymmetric JWT signing keys if the project still uses legacy symmetric signing; the MCP endpoint verifies tokens through the project's published JWKS.
4. In ChatGPT or Claude, add the HTTPS MCP endpoint as a custom connection using OAuth. Sign in to Fieldbook as an administrator and approve the access described on the consent screen. Plan/workspace availability is controlled by the client provider.
5. Verify `search`, `fetch`, `create_content`, `update_content`, `publish_content`, `unpublish_content`, `content_report`, and `list_media`. Start with a disposable draft. Verify stale revisions are rejected and public content stays unchanged until publication.
6. Use `/connections` to revoke a client. Fieldbook checks its active grant on every request; revocation also removes the provider's OAuth grant and refresh tokens.

The AI can edit Markdown, lessons, and quizzes through the same service as the admin editor. Upload binary files through the app, then use `list_media` to reference them from MCP. MCP does not accept a service-role key or unauthenticated writes. The current tools are admin-only; learner and manager MCP access is not implemented.

## Media and free-plan boundaries

Uploads go directly from an authorized administrator's browser to the private `fieldbook-media` bucket. The app issues a token for one random path, then verifies the uploaded object's metadata before accepting it. Supported formats: JPG, PNG, WebP, GIF, MP4, WebM. The initial per-file ceiling is 50 MB. There is no transcoding, automatic captioning, or adaptive streaming; use browser-compatible H.264/AAC MP4 or WebM files.

Published content may reference uploaded media. Guests receive short-lived signed URLs only for files referenced by published content or the site logo; drafts require admin access. Unpublishing stops new signed URLs, but an already-issued link can work for up to five minutes. Treat media published to a public site as public.

The provisioned free plan showed 500 MB database space, 1 GB file storage, and 5 GB bandwidth. Confirm provider limits before launch. Free plans may pause inactive projects and do not supply the same backup/recovery guarantees as paid plans. No paid upgrade is authorized. Arrange manual exports before relying on this instance for important content.

## Implemented boundaries and remaining verification

- Public/private browsing and open/closed application registration are admin settings. Google credentials and the owner email are deployment settings.
- The browser never receives a database secret, other users' profiles/progress, drafts, or quiz answer keys unless it is an authorized administrator.
- Guest learning stays in browser storage. On sign-in, users can import it; answers are re-graded against the current course version. Browser data is not treated as a trusted quiz result. Changed/deleted courses can prevent import and retain the local records for review.
- Saves require a matching content revision. Draft and published snapshots are separate. Content writes and publication/unpublication are audited transactionally with the acting user and source.
- Tables and write functions deny direct `anon` and `authenticated` access. The Next.js server validates identity and permissions before using the service role.
- Search and reporting are deliberately small-instance implementations, not dedicated search infrastructure. The catalog/reports currently use Supabase's default 1,000-row response limit; MCP search scans the 500 newest documents and returns at most 50 matches, and media listing returns 100 items.
- Company groups, teams, and manager reporting administration are not enabled in this production release. Glean, external video-provider integrations, rich WYSIWYG editing, and hosted multi-company SaaS are outside this milestone.

Before calling the instance ready, verify the real Google redirect flow, a second learner account's permissions and cross-device progress, guest import, image/video upload and playback, draft-media protection, MCP OAuth from an actual supported client, token expiry/revocation, and a database export/restore. Local tests and successful builds alone do not verify these external integrations.

## Local development

Copy `.env.example` to `.env.local` in this directory and supply a dedicated development backend. From the repository root: `pnpm install`, `pnpm dev:production`, `pnpm test`, and `pnpm build:production`. Do not use production secrets for local tests or commit environment files.
