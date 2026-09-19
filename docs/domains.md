# Your instance address

`FIELDBOOK_URL` is the canonical origin, for example `https://learn.example.org`. It determines login redirects, browser write checks, MCP discovery URLs and the expected token audience. It is deployment configuration, not a shared hardcoded Fieldbook service.

The current admin panel displays the browser tab's origin followed by `/api/mcp`; it does not read the server variable. Treat this as accurate only when visiting the canonical origin. The server's audience and discovery configuration still come from `FIELDBOOK_URL`.

Adding a custom domain to your host does not change this variable. An instance may load on a second domain while authenticated writes or redirects still depend on the old one. Configure one canonical origin before connecting AI clients.

## URL map

| Setting | Example |
|---|---|
| Hosting domain / `FIELDBOOK_URL` | `https://learn.example.org` |
| Supabase Auth Site URL | `https://learn.example.org` |
| Supabase allowed app callback | `https://learn.example.org/auth/callback` |
| Supabase OAuth consent path | `/oauth/consent` |
| MCP server and token audience | `https://learn.example.org/api/mcp` |
| Google OAuth provider callback | `https://YOUR-PROJECT.supabase.co/auth/v1/callback` |
| AI client's callback | Exact URI supplied by that AI client; register in Supabase OAuth clients |

Google's Supabase callback remains correct when the website domain changes. Google brand verification can display your app name without paying for a Supabase custom domain. The Supabase address may still exist in the underlying authentication URL.

## Changing an existing installation's domain

Schedule a short maintenance window; existing AI connections may need reauthorization.

1. Record the current URLs and settings for rollback. Back up your database and verify the new domain's HTTPS certificate.
2. Add the new exact app callback to Supabase Auth. Update its Site URL and confirm the OAuth consent path resolves on the new site.
3. Set `FIELDBOOK_URL` to the new origin and redeploy. Update Google homepage/privacy links and authorized domain as needed; complete ownership/branding verification if prompted.
4. Test login, administrator saves and learner progress on the new origin. Browser-local guest progress and session cookies do not automatically move between domains; import guest progress beforehand where needed.
5. Change each AI client's MCP endpoint and reconnect. Complete administrator consent so `fb_oauth_config.resource` and new access tokens use the new `/api/mcp` audience. Tokens for the old audience will be rejected. Do not run two writable deployments with different canonical origins against the same backend: their consent flows would compete for this shared audience setting.
6. Verify tools and revocation, then remove obsolete app callbacks and redirect the old site when appropriate. A redirect alone is not a token migration.

If rollback is necessary, restore the previous origin and matching Supabase URLs, redeploy and reconnect affected clients. Do not weaken the token audience check to make old tokens work.
