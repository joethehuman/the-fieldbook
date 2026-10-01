# Vercel + Supabase + Google

This is Fieldbook's current supported recipe. Follow the [complete installation guide](../../docs/installation.md) for Supabase migrations, Google callbacks, optional MCP and the deletion worker.

| Setting | Installed application |
| --- | --- |
| Root Directory | Repository root; leave the field empty |
| Framework | Next.js |
| Build | `pnpm build` |
| Runtime | Node.js 22.x; pnpm 10.17.1 from the lockfile/project configuration |
| App identity | `FIELDBOOK_APP_KIND=installed` |
| Hosting selection | Omit `FIELDBOOK_HOST` for automatic detection, or set `vercel` |
| Production origin | `FIELDBOOK_URL`, canonical HTTPS origin |
| Backing services | Dedicated hosted Supabase project; Google configured in its Auth service |

Use root [`.env.example`](../../.env.example) as the variable reference. The optional browser-local demo is a separate project rooted at `demo/`, with `FIELDBOOK_APP_KIND=demo` and shared files outside that root enabled.

Preview deployments require a dedicated isolated Supabase project and matching `FIELDBOOK_PREVIEW_SUPABASE_REF`. Vercel's trusted branch address becomes the preview canonical origin; its unique deployment address remains valid for same-origin API requests. Set callback allowlists and the cleanup-worker destination only in that isolated project.

Vercel does not apply SQL migrations. Fork/branch deployment controls code rollout; database upgrades, provider configuration and content publication are separate operator actions. See [versions and upgrades](../../docs/upgrading.md).
