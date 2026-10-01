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

## Analytics and Speed Insights

Both official SDKs are included. Vercel host detection enables them in the installed app and optional demo with their normal behavior. Each deployment reports to its own Vercel project. Local development and other hosts do not load them by default.

1. In your Vercel project's **Analytics** tab, enable Web Analytics. Do this separately for an optional demo project. This is an operator action in your own account; installing Fieldbook does not enable the account feature. Vercel's plan and usage pricing apply.
2. Deploy or redeploy after enabling Analytics so its collection routes are available. Standard Speed Insights starts collecting from the included SDK on deployment; **Speed Insights Plus** is a separate optional upgrade.
3. Visit the deployed application and navigate between pages. Confirm the Analytics and Speed Insights scripts load successfully, then check their project dashboards after Vercel processes visits and performance measurements. Browser blocking tools can prevent collection. The demo uses hash navigation; the SDK tracks page URLs/Next.js routes, not individual simulated screens inside a hash route.

No extra API key is required. To disable either integration, set `FIELDBOOK_VERCEL_ANALYTICS_ENABLED=false` or `FIELDBOOK_VERCEL_SPEED_INSIGHTS_ENABLED=false` in that project's environment and redeploy. Removing a SDK from the app does not change account subscriptions; manage those separately in Vercel.

See [Web Analytics setup](https://vercel.com/docs/analytics/quickstart), [Speed Insights setup](https://vercel.com/docs/speed-insights/quickstart), [Analytics pricing](https://vercel.com/docs/analytics/limits-and-pricing) and [Speed Insights pricing](https://vercel.com/docs/speed-insights/limits-and-pricing). Contributor boundaries are described in [hosting and service providers](../../docs/providers.md#platform-features).
