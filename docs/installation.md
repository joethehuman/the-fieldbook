# Install The Fieldbook

This guide installs the server application from the repository root. The optional demo/ app uses fictional browser-local data and is not an installation. The supported setup is **Vercel, hosted Supabase, and Google sign-in**. You need your own GitHub, Vercel, Supabase, and Google Cloud accounts. A custom domain and AI client are optional.

Use an available release tag or an exact reviewed commit. Keep a record of that commit and your applied migrations. Do not connect a live installation directly to an upstream development branch if you want to control upgrades.

## 1. Prepare Supabase

Create a dedicated hosted Supabase project. Save its database password and project credentials securely. Apply **every SQL file** in supabase/migrations/ from your selected commit, one file at a time in filename order. The first migration creates the private fieldbook-media bucket; later files add search, administration, recovery, and the scheduled deletion job. Do not stop at a migration named for the feature you intend to use. For an existing installation, follow [upgrading](upgrading.md) instead of replaying the initial schema.

Record successful SQL-editor runs yourself. They are not automatically registered as CLI migrations. Do not rerun them through another method without reconciling that record.

## 2. Configure Vercel

Import **your own repository and chosen production branch** into Vercel. Use the Next.js preset, Node.js 22.x, the repository root as Root Directory (leave that field empty), the default Next.js output directory, and pnpm build. Set these environment variables for the installed app:

| Variable | Value |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Your Supabase project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Its publishable key |
| SUPABASE_SECRET_KEY | Its server-only secret key |
| FIELDBOOK_URL | The canonical HTTPS origin of this installation, with no path |
| FIELDBOOK_OWNER_EMAIL | The exact Google email that will bootstrap the first administrator |
| FIELDBOOK_APP_KIND | installed |

The root [.env.example](../.env.example) lists optional settings. Never put SUPABASE_SECRET_KEY in a NEXT_PUBLIC_ variable or commit deployment secrets. On Vercel, the included Analytics and Speed Insights integrations default on; set FIELDBOOK_VERCEL_ANALYTICS_ENABLED=false or FIELDBOOK_VERCEL_SPEED_INSIGHTS_ENABLED=false before deployment if you do not want them. Match your privacy policy to the services you enable. A second Vercel project rooted at demo/ is optional; set its FIELDBOOK_APP_KIND to demo and enable files outside that root. Demo data does not migrate to Supabase.

For a preview that needs real writes, use a **separate** Supabase project and Google OAuth configuration. Set FIELDBOOK_ENVIRONMENT=preview and FIELDBOOK_PREVIEW_SUPABASE_REF to that project's reference. Never connect a preview to the production backend.

## 3. Configure Google sign-in

Create a Google OAuth **web client**. Give Google this authorized redirect URI, replacing PROJECT_REF with your Supabase project reference:

~~~text
https://PROJECT_REF.supabase.co/auth/v1/callback
~~~

In Supabase Auth, enable the Google provider with that client's ID and secret. Set the Supabase **Site URL** to your FIELDBOOK_URL and allow this exact application callback:

~~~text
https://YOUR-FIELDBOOK-HOST/auth/callback
~~~

These are different callbacks: Google returns to Supabase; Supabase returns to Fieldbook. Avoid wildcard production callback domains. Google's Testing audience permits only configured test users; configure its public audience and branding when you open sign-in more widely. See [Supabase's Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google) and [redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls).

Deploy, then sign in with FIELDBOOK_OWNER_EMAIL. The first verified sign-in at that address creates the administrator profile. Other accounts do not choose their own role. The owner variable does not transfer or demote an existing administrator if changed later.

## 4. Finish the installation

In Admin, set the installation name, public or members-only access, registration choice, and an accurate privacy-policy link for **your** installation. Closed registration requires an administrator to preregister a person's Google email in People; no invitation email is sent. Create a draft, publish it, and check the result as a separate reader. A new Supabase project has no demo content.

### Configure the deletion worker

The migrations install an hourly schedule but leave its destination empty. Before using Delete, set the endpoint in **this installation's** Supabase SQL editor after the app is deployed. Use the direct canonical HTTPS host; a redirect may drop the Authorization header.

~~~sql
update public.fb_cleanup_config
set endpoint = 'https://YOUR-DIRECT-HOST/api/internal/purge-deleted'
where id = true;
~~~

A private database-generated credential authenticates the scheduled call. Do not display or copy it. Keep each preview database pointed only at its matching preview app. For a fresh, empty installation, send a test request from the same project's SQL editor:

~~~sql
select net.http_post(
  url := endpoint,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || secret
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id
from public.fb_cleanup_config
where id = true and endpoint is not null;
~~~

After the transaction commits, look up the returned request ID in net._http_response, confirm HTTP 200, and check that last_run advanced in public.fb_cleanup_config. Then check the first timed run in cron.job_run_details for the fieldbook-purge-deleted job. A successful queued SQL request alone does not prove the app accepted it. On an existing installation, a manual request may process due deletions; review the queue before testing. Deleted content and accounts have a 30-day recovery window before permanent cleanup.

### Media and upload limits

The fieldbook-media bucket must remain private. The initial migration may set a 50 MB bucket limit. In Supabase Storage settings, choose the global limit allowed by your plan and adjust the bucket limit deliberately; upgrading a plan does not change either setting automatically. Optional FIELDBOOK_UPLOAD_MAX_BYTES is a separate application limit. Fieldbook accepts JPG, PNG, WebP, GIF, MP4, and WebM; it does not transcode video. Larger files use signed chunked uploads directly to Supabase Storage. Test a representative upload and playback. Back up Storage files separately from the database.

## Optional AI connections

The installed app exposes an authenticated MCP endpoint at FIELDBOOK_URL/api/mcp. To use it, enable Supabase Auth's OAuth 2.1 Server, set its consent path to /oauth/consent, enable the Custom Access Token Hook public.fb_access_token_hook, and use asymmetric JWT signing keys so Fieldbook can verify tokens through the project's JWKS. Register an AI client with its exact callback, connect to the HTTPS MCP endpoint, approve its requested capabilities, and call get_capabilities. Test a disposable draft, separate publication, and revocation from /connections. Access depends on both the user's current Fieldbook role and that connection's approved capabilities. Keep temporary media transfer URLs out of published content.

Learner Ask AI is separate and off by default. Its implemented router is Vercel AI Gateway; configure a model and the installation setting only if you intend to use it. The optional AI_GATEWAY_API_KEY supports local or alternative credentials. Basic reading and admin work do not require either AI feature.

## Verify before use

- Owner sign-in works; a learner cannot see drafts, admin controls, or other learners' data.
- Public or members-only browsing and registration follow the settings you chose.
- Publication appears to an admitted reader; learner progress persists across devices.
- Image and video upload/playback work, while draft media remains private.
- The privacy link names your operator and policy.
- The deletion worker endpoint responds and its scheduled run succeeds.
- If enabled, MCP consent, permitted tools, and revocation work from a real client.
- Database **and** media backups restore in an isolated environment.

For local development, copy .env.example to a root .env.local and use a dedicated development Supabase project. Configure its application callback for http://127.0.0.1:3000 and use that origin as FIELDBOOK_URL. The Google callback still points to the development Supabase project. Run pnpm install --frozen-lockfile and pnpm dev; use pnpm dev:demo for the browser-local demo.
