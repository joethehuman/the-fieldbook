# Install The Fieldbook

The supported setup is Next.js on Vercel, hosted Supabase for database, authentication and private media, and Google sign-in. You need your own GitHub, Vercel, Supabase and Google Cloud accounts, plus Node.js 22 on your computer to run database setup. A custom domain is optional.

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
