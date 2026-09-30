# Connect an AI to your Fieldbook

MCP (Model Context Protocol) lets an AI client discover and call Fieldbook's tools. The server is part of the Next.js production app, at **`https://YOUR-INSTANCE/api/mcp`**. No separate repository, process, model subscription inside Fieldbook, or agent skill is required. Each operator connects their own ChatGPT/Claude account to their own instance.

The demo has no real MCP endpoint. Do not copy another operator's URL, client credentials, or database keys.

## How access works

1. The AI client connects to your MCP endpoint and discovers its OAuth authorization server (your Supabase project).
2. You sign in to Fieldbook with Google as an administrator.
3. Fieldbook shows the client and asks you to approve its access.
4. Supabase issues a token bound to this instance's MCP URL. Each tool request checks that token, your active administrator profile, and the unrevoked client grant.

Knowing the URL is not permission. A normal learner login is not an MCP administrator token. Google sign-in authenticates the person; Supabase's OAuth server authorizes the AI client. These are separate OAuth configurations.

## Set up the authorization server

Complete the [production setup](installation.md) first, including both database migrations.

1. Set `FIELDBOOK_URL` to the final HTTPS origin and configure the matching Supabase Auth Site URL and app callback.
2. Enable Supabase Auth's **OAuth 2.1 Server** with authorization path `/oauth/consent`.
3. Enable the **Custom Access Token Hook** using `public.fb_access_token_hook` from the second migration. Fieldbook consent writes the endpoint to `fb_oauth_config`; the hook uses it as the token audience for approved connections. There is no need to seed that table manually on a new installation.
4. Use an asymmetric signing key supported by Supabase's JWKS (the initial deployment used ES256). Do not remove existing signing keys without planning token rotation.
5. Leave **dynamic client registration off** for a small installation and register clients manually.

See [Supabase OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started). Provider menus may change; keep the URL relationships above consistent.

## Register and connect a client

Create a separate registration for each client application, such as ChatGPT and Claude. Reuse it only where the provider documents that this is appropriate.

1. In the AI client's custom app/connector setup, enter your instance's `/api/mcp` URL and choose OAuth. Obtain the **exact callback/redirect URI** required by that client. It may be specific to the connection; don't reuse an example from this repository.
2. In your Supabase OAuth server's client management, register that callback URI with a descriptive name. For clients accepting a client secret, use a confidential client and the token authentication method they support. The initial ChatGPT connection used `client_secret_basic`.
3. Copy the generated client ID and secret directly into the AI client's OAuth configuration. Store secrets securely; never put them in a chat, README, public environment variable, or source control. The client secret is not the Supabase project secret or Google OAuth secret.
4. Finish the connection, sign in as the Fieldbook administrator and approve the named client. Let the client discover the tools.
5. Ask it to find content and create a disposable draft. On an empty installation, create a draft in the admin panel first so a read test has something to find. Check that draft in `/admin` before asking it to publish anything.
6. Test revocation in `/connections`; future calls must fail. Reconnect and approve again if you want to keep using the client.

The verified setup uses ChatGPT's custom MCP app/developer-mode flow. Claude has not been verified for this project; its custom remote connector setup is a reference for operators who choose to test it. Availability and workspace approval depend on the client's current plan and policy. If its UI requires a different registration flow, follow its current documentation; do not enable anonymous access as a workaround.

- [ChatGPT developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)
- [Claude custom remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

## Tools and limits

| Tool | Purpose |
|---|---|
| `search`, `fetch` | Find and read content, including administrator drafts |
| `create_content` | Create a draft article, field note, or course |
| `update_content` | Replace a draft using its expected revision |
| `publish_content`, `unpublish_content` | Explicitly change public availability |
| `content_report` | Aggregate course progress and feedback counts |
| `list_media` | Find uploaded files to reference in content |

The current grant is administrator-level across these tools, not a read-only or per-folder grant. It does not provide a general database interface, account administration, or individual learner reports. Upload files through the admin editor; MCP lists and references existing media. Search scans the newest 500 documents and returns up to 50 matches; media listing returns up to 100 items. Reports read all pages of documents, progress and feedback; they return `complete: true` only after those reads succeed, replacing the former `recordLimit: 1000` field. Failed pages return an error rather than partial totals. Course started/completed counts use the current published version and the same activity/completion rules as learner course cards: empty reset records and removed lessons alone are not activity; quiz attempts are. Feedback counts retain all recorded versions. Pagination is not a transactional snapshot across concurrent edits.

[Optional authoring guidance](ai-authoring.md) can be supplied as project instructions. Tool schemas are the source of truth, and the server enforces authorization regardless of those instructions. A skill file is not required: these instructions do not install a connection, create credentials, or replace OAuth.

## Troubleshooting

- **401 / invalid token:** check signing keys, token hook, issuer and exact MCP audience. Ordinary app-session tokens are intentionally rejected.
- **403:** check administrator status, the active grant, and the request origin. The current server accepts browser origins for the instance, ChatGPT and Claude; another browser client may need a reviewed allowlist change.
- **Redirect mismatch:** compare the AI callback with its Supabase OAuth registration. This is separate from Google's callback and Fieldbook's `/auth/callback`.
- **Revision conflict:** fetch the latest content, preserve fields, then retry with its current revision. Do not overwrite silently.
- **Old hostname:** follow the [domain migration guide](domains.md), then reconnect the AI client.

Initial validation included a real ChatGPT connection and draft edit. Claude is an unverified client for this project; the linked provider documentation is reference material, not a tested Fieldbook installation path. Do not treat one client's successful setup as proof that every client works.
