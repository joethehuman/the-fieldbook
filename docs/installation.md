# Install The Fieldbook

This guide installs the server application from the repository root. The optional demo/ app uses fictional browser-local data and is not an installation. The supported setup is **Vercel, hosted Supabase, and Google sign-in**. You need your own GitHub, Vercel, Supabase, and Google Cloud accounts. A custom domain and AI client are optional.

Use an available release tag or an exact reviewed commit. Keep a record of that commit and your applied migrations. Do not connect a live installation directly to an upstream development branch if you want to control upgrades.

## 1. Create a Supabase project

Create a dedicated, empty hosted Supabase project. Keep its database password and project credentials secure. Note the 20-letter project reference in its dashboard URL. Do not use an existing installation's database for first-time setup; use [upgrading](upgrading.md) for that database.

## 2. Configure Vercel

Import **your own repository and chosen production branch** into Vercel. Use the Next.js preset, Node.js 22.x, the repository root as Root Directory (leave that field empty), the default Next.js output directory, and pnpm build. Set these environment variables for the installed app:

| Variable                             | Value                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| NEXT_PUBLIC_SUPABASE_URL             | Your Supabase project URL                                          |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Its publishable key                                                |
| SUPABASE_SECRET_KEY                  | Its server-only secret key                                         |
| FIELDBOOK_URL                        | The canonical HTTPS origin of this installation, with no path      |
| FIELDBOOK_OWNER_EMAIL                | The exact Google email that will bootstrap the first administrator |
| FIELDBOOK_APP_KIND                   | installed                                                          |

The root [.env.example](../.env.example) lists optional settings. Never put SUPABASE_SECRET_KEY in a NEXT_PUBLIC_ variable or commit deployment secrets. On Vercel, the included Analytics and Speed Insights integrations default on; set FIELDBOOK_VERCEL_ANALYTICS_ENABLED=false or FIELDBOOK_VERCEL_SPEED_INSIGHTS_ENABLED=false before deployment if you do not want them. Match your privacy policy to the services you enable. A second Vercel project rooted at demo/ is optional; set its FIELDBOOK_APP_KIND to demo and enable files outside that root. Demo data does not migrate to Supabase.

For a preview that needs real writes, use a **separate** Supabase project and Google OAuth configuration. Set FIELDBOOK_ENVIRONMENT=preview and FIELDBOOK_PREVIEW_SUPABASE_REF to that project's reference. Never connect a preview to the production backend.

## 3. Set up the database

After the app is deployed, run this once from a local copy of the same repository commit with Node.js 22:

```sh
node scripts/setup-database.mjs
```

The guided command asks for the Supabase project reference and the deployed Fieldbook HTTPS address. Sign in to Supabase when prompted, and confirm the project shown before setup begins. It checks that the database is empty, installs Fieldbook's schema, connects the hourly deletion cleanup, and checks its settings, private media bucket, and cleanup schedule. The same command includes later database changes when setting up a new project. It does not reset an existing database.

The command downloads a specific Supabase CLI version as needed; no separate CLI installation is required. Keep Supabase credentials out of repository files. If setup stops, read the error before retrying; a partially installed project should be reviewed rather than treated as empty. The deployed address must accept requests directly, without a sign-in screen or deployment protection in front of the cleanup route.

## 4. Configure Google sign-in

Create a Google OAuth **web client**. Give Google this authorized redirect URI, replacing PROJECT_REF with your Supabase project reference:

```text
https://PROJECT_REF.supabase.co/auth/v1/callback
```

In Supabase Auth, enable the Google provider with that client's ID and secret. Set the Supabase **Site URL** to your FIELDBOOK_URL and allow this exact application callback:

```text
https://YOUR-FIELDBOOK-HOST/auth/callback
```

These are different callbacks: Google returns to Supabase; Supabase returns to Fieldbook. Avoid wildcard production callback domains. Google's Testing audience permits only configured test users; configure its public audience and branding when you open sign-in more widely. See [Supabase's Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google) and [redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls).

Sign in with FIELDBOOK_OWNER_EMAIL. The first verified sign-in at that address creates the administrator profile. Other accounts do not choose their own role. The owner variable does not transfer or demote an existing administrator if changed later.

## 5. Finish the installation

In Admin, set the installation name, public or members-only access, registration choice, and an accurate privacy-policy link for **your** installation. Closed registration requires an administrator to preregister a person's Google email in People; no invitation email is sent. Create a draft, publish it, and check the result as a separate reader. A new Supabase project has no demo content.

The database setup command connects scheduled cleanup to this deployed Fieldbook. It checks the worker route and the database schedule; after the first hourly run, confirm it succeeds in Supabase Cron History. Deleted content and accounts have a 30-day recovery window before permanent cleanup.

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
