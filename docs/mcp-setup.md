# Connect an AI to your Fieldbook

MCP (Model Context Protocol) lets an AI client discover and call Fieldbook's tools. The server is part of the Next.js production app, at **`https://YOUR-INSTANCE/api/mcp`**. No separate repository, process, model subscription inside Fieldbook, or agent skill is required. Each operator connects their own ChatGPT/Claude account to their own instance.

The demo has no real MCP endpoint. Do not copy another operator's URL, client credentials, or database keys.

## How access works

1. The AI client connects to your MCP endpoint and discovers its OAuth authorization server (your Supabase project).
2. You sign in to Fieldbook with Google using an eligible active account.
3. Fieldbook shows the client and asks you to approve its access.
4. Supabase issues a token bound to this instance's MCP URL. Each tool request checks that token, your current active account, reporting responsibility and unrevoked client grant.

Knowing the URL is not permission. Learners have no MCP access. Google sign-in authenticates the person; Supabase's OAuth server authorizes the AI client. These are separate OAuth configurations.

## Set up the authorization server

Complete the [production setup](installation.md) first, including every database migration in filename order.

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
4. Finish the connection, sign in with an eligible Fieldbook account and explicitly approve the named client's permissions. Let the client discover the tools.
5. Ask it to find content and create a disposable draft. On an empty installation, create a draft in the admin panel first so a read test has something to find. Check that draft in the publishing panel before asking it to publish anything.
6. Test revocation in `/connections`; future calls must fail. Reconnect and approve again if you want to keep using the client.

The verified setup uses ChatGPT's custom MCP app/developer-mode flow. Claude has not been verified for this project; its custom remote connector setup is a reference for operators who choose to test it. Availability and workspace approval depend on the client's current plan and policy. If its UI requires a different registration flow, follow its current documentation; do not enable anonymous access as a workaround.

- [ChatGPT developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)
- [Claude custom remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

## Permissions, tools and limits

| Account | Available permissions |
|---|---|
| Learner | No MCP connection or tools |
| Contributor | Read and edit all content, publish/unpublish, media uploads and feedback; cannot manage course assignments or Docs hierarchy |
| Manager | Learning reports for explicitly managed teams and their descendants; no content editing |
| Contributor who explicitly manages a team | Contributor permissions plus reports for that managed branch |
| Administrator | Every tool, including organization-wide reporting and course assignments |

Roles and team responsibilities are checked again on every request. A learning-group filter only narrows an allowed reporting scope. Published content is installation-wide; learning groups guide relevance and assignments, never content access. Contributors are trusted publishers across the installation's content. See [roles and permissions](permissions.md).

| Tools | Purpose |
|---|---|
| `get_capabilities` | Discover effective permissions, missing consent, supported formats and manual guidance |
| `search`, `fetch`, `get_authoring_options` | Find/read current drafts and select existing Docs sections and categories |
| `create_content`, `update_content` | Save Docs, Updates and Courses as drafts with revision checks |
| `publish_content`, `unpublish_content` | Explicit publication; major course changes can start a new version |
| `list_media`, `prepare_media_upload`, `complete_media_upload` | Reuse ready media or prepare and verify an owned upload |
| `get_reporting_scopes`, `learning_report` | Named learning reports filtered by teams, learning groups and courses |
| `feedback_report` | Content/general feedback with names and comments |
| `content_report` | Original administrator aggregate course/feedback report |
| `manage_course_assignment` | Administrator assignment of a published course to an existing team or group |

Search covers every non-deleted item, including lesson prose, with keyset pagination instead of the old 500-item scan. Search and media return at most 100 rows per page (50 by default). Follow `nextCursor` until `complete` is true. Concurrent catalog edits can move rows between pages; search is not a snapshot. Learning and feedback exports also paginate, but reject continuation when matching data or scope changes; restart that report instead of combining incompatible pages. Reports use current published course versions and saved assignment deadlines. Optional activity is separate and never lowers assigned completion. See [reporting behavior](reporting.md).

The editor uses Markdown for styled text, lists, tables, links and images with alternative text. Course lessons support quizzes and video URLs for private uploaded MP4/WebM files, HTTPS MP4/WebM, YouTube, Vimeo and Loom. Use stable `/api/media/...` references, never temporary storage URLs. MCP upload preparation returns a temporary PUT or resumable TUS instruction. The client must transfer bytes outside MCP and then complete verification. Clients unable to transfer files must use the editor upload; MCP cannot import arbitrary remote URLs. Provider global/bucket limits and optional `FIELDBOOK_UPLOAD_MAX_BYTES` still apply.

Privacy policy, account/role administration, team/group membership, curricula, Docs hierarchy, installation settings, deletion/recovery and learner overrides are manual operations. Ask `get_capabilities` about the requested operation for an installation-local destination and guidance. It does not require access to a particular maintainer's website.

## Existing connections and upgrades

Deploying this version at the same origin preserves `/api/mcp`, the OAuth registration and existing administrator connection. Its original consent preserves the permissions used by the original eight tools, plus capability discovery and authoring options covered by those same permissions. New named-report, feedback, assignment and media-transfer permissions require explicit approval in **Connections**; select the added permissions and approve them for that same connection. Existing credentials do not need to be copied into a new registration. Revoked connections must reconnect. An account promoted to administrator must approve its wider access again; downgrades and team removals take effect immediately.

After a server update, refresh the AI client's tool definitions. For ChatGPT custom developer-mode apps, use **Refresh** in the existing app's settings and start a new chat. A conversation can retain an older tool list. Client behavior and workplace approval vary; follow its current documentation if it requests reconnection.

Apply the three additive MCP migrations before deploying this version; see [upgrade order](upgrading.md#expanded-mcp-contract-and-permissions).

## Portable contract

The executable versioned contract is `lib/mcp-contract.ts`, with Fieldbook roles/capabilities in `lib/mcp-access.ts`. [The generated contract](mcp-contract.json) contains input/output schemas, tool annotations, stable error codes and manual operations. Run `pnpm generate:mcp` after changing the definition and `pnpm check:mcp` to verify the checked-in copy.

The contract uses application values and stable media references. Supabase identity, SQL queries and storage instructions remain behind ports/adapters. A replacement provider must implement those ports and equivalent authorization, revision, report and upload guarantees, then pass the contract tests and hosted acceptance. Supabase is the current implementation; Neon or DigitalOcean still needs a complete reviewed installation recipe. See [provider boundaries](providers.md).

[Optional authoring guidance](ai-authoring.md) can be supplied as project instructions. Tool schemas and server checks remain authoritative; a skill file does not grant permissions or replace OAuth.

## Troubleshooting

- **401 / invalid token:** check signing keys, token hook, issuer and exact MCP audience. Ordinary app-session tokens are intentionally rejected.
- **403:** check current role, managed teams, approved permissions, the active grant and request origin. The current server accepts browser origins for the instance, ChatGPT and Claude; another browser client may need a reviewed allowlist change.
- **Redirect mismatch:** compare the AI callback with its Supabase OAuth registration. This is separate from Google's callback and Fieldbook's `/auth/callback`.
- **Missing consent:** approve the named permissions in Connections, then refresh the client tools.
- **Report changed:** restart with the same filters; do not append pages from different report states.
- **Revision conflict:** fetch the latest content, preserve fields, then retry with its current revision. Do not overwrite silently.
- **Old hostname:** follow the [domain migration guide](domains.md), then reconnect the AI client.

Initial validation included a real ChatGPT connection and draft edit. Claude is an unverified client for this project; the linked provider documentation is reference material, not a tested Fieldbook installation path. Do not treat one client's successful setup as proof that every client works.
