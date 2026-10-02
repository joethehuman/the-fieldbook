# Ask AI

Ask AI adds optional answers from published Fieldbook content using the AI SDK and a server-selected model router. Vercel AI Gateway is the first supported connector. It is **off by default** in installed applications. The search panel includes temporary conversations when enabled. Administrators configure it under **Organization Settings → Ask AI**. The browser-local demo shows the same controls with illustrative models; all answers remain local unavailable responses.

## Installation and configuration

Use the supported [Vercel + Supabase + Google installation](installation.md). Apply `supabase/migrations/20261002011512_ask_ai_passages.sql` after all earlier migrations, first on an isolated backend. It adds two read-only, service-role-only functions over the existing published search index. It creates no new tables and does not change content, settings, profiles, progress or ordinary search. Older application code remains compatible. Apply each migration once and record it; code rollback can leave these functions in place.

### Turn it on in your installation

1. Complete the ordinary [installation](installation.md) with your own Vercel, Supabase and Google accounts. Sign in to Fieldbook as an administrator. AI off requires no Gateway key or account connection, and enabling AI does not change Google sign-in or Supabase credentials.
2. Apply the migration above to your isolated preview backend before deploying/testing this code there. For an existing live installation, back up and rehearse first, then apply the additive migration before its code deployment. Follow [upgrades](upgrading.md); Vercel does not run SQL automatically.
3. In the Vercel **team that owns your Fieldbook project**, open **AI Gateway**. Review credits, payment/refill settings and permitted models. Deployed Vercel projects use automatic project OIDC authentication when no Gateway API key is set; you do not need a separate upstream provider account/key for Gateway-managed access. Free credits can have account/payment requirements. See [Gateway setup](https://vercel.com/docs/ai-gateway/getting-started) and [OIDC](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc).
4. Set `FIELDBOOK_AI_ROUTER=vercel` in the server deployment configuration. Router selection is independent of the hosting platform. Existing installations that omit it keep the Vercel connector for compatibility. Redeploy after changing deployment variables.
5. In Fieldbook, open **Manage organization → Organization Settings → Ask AI**. Switch **Enable Ask AI** on. The form displays the configured router, then primary/fallback models, published sources and Answer guidance. Choose a **Primary model** and optionally a different **Fallback model**; neither is chosen automatically. Reset to default restores concise guidance.
6. Opening the enabled form automatically reads model metadata and checks both retrieval functions with empty inputs. It generates no answer, reads no published bodies and saves no settings. Resolve any inline setup warning. **Configured** means the connector found its credential configuration; it does not prove working authentication or available credit. Review the selected service's prices and data policies in its own documentation.
7. **Save settings** with Ask AI enabled. Enabling or changing either enabled model validates the catalog choices and retrieval without generating text. Try a question about known published content from the header to verify real model access. Off shows only the switch, restores basic search, retains all choices, and can be saved when the router is unavailable. Successful saves clear the unsaved-changes warning. Failed saves keep your edits for another Save; a read checks whether a lost response was actually saved. If another administrator changed the settings, reload before saving to avoid overwriting their changes.

The shared form has no router-specific account controls or paid setup tests. Models come from the selected connector's catalog; each connector determines which models meet Fieldbook's planning/answer requirements. The current Vercel connector includes every tool-capable text model, ordered by combined base input/output price with unreported prices last, and caches metadata for up to five minutes. Menus support scrolling and keyboard typeahead. A catalog is not an account allowlist or proof of authentication/credit. Model choices apply installation-wide; visitors do not select models.

### Router configuration and saved choices

`FIELDBOOK_AI_ROUTER` selects the connector on the server. Today, only `vercel` is implemented. An explicit `none`, empty or unknown value makes the router unavailable; it never silently switches providers. Admin displays a setup warning while AI is on. The feature remains off by default regardless of router selection. Credentials are server environment variables owned by the chosen connector, never site settings or browser data.

The connector supplies its identity, display name, credential-configuration status, available models and fallback capability. This is how Admin knows what service the installation selected; it does not infer a router from the host or inspect arbitrary accounts. Hosting on another platform does not automatically select that platform's inference service.

Saved primary/fallback choices include a `router` identity. Older settings without this field belong to the original `vercel` connector. Changing the installation's router requires choosing a primary again and reviewing the fallback, even when model IDs look identical. This prevents old choices being sent to a different service accidentally. Disabling AI retains the choices and works with missing router configuration. Model IDs are bounded catalog values; they do not have to follow a `vendor/model` naming scheme. A connector must validate them before generation. Fallback support is explicit; unsupported fallback selections are rejected, rather than promising silent failover.

Adding another router requires implementing `server/ports/ai.ts`, registering it in `server/ai.ts`, documenting credentials/setup and verifying discovery, planning, streaming, cancellation, errors and fallback behavior. The shared Admin controls and Fieldbook evidence/access policies remain the same. No DigitalOcean, Netlify or OpenRouter connector is provided by this change, and no alternate hosting/database/auth stack is claimed as supported.

### Server API key alternative

For local development or an environment without Vercel OIDC, open your Vercel team's **AI Gateway → API Keys**, create a key and copy it directly into the server environment as `AI_GATEWAY_API_KEY`. On Vercel, use **Project → Settings → Environment Variables**, select only the intended environment, and redeploy. Locally, use an ignored root `.env.local` and restart the server. Never put the key in site settings, a `NEXT_PUBLIC_` variable, an export, an AI prompt or a screenshot. If a key is set it takes precedence over OIDC. See [API keys](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys).

Alternatively, local Vercel development can use `vercel link` and `vercel env pull`; pulled OIDC tokens expire and need refreshing. The adapter can call Gateway from another host with a server key, but Fieldbook currently documents and verifies only its Vercel/Supabase/Google stack. Changing the entire hosting/router stack requires a separate supported recipe.

An operator can give a setup agent this request:

> Follow docs/installation.md and docs/ask-ai.md for my Fieldbook installation. Identify my own Vercel project and isolated Supabase environment first. Keep AI off while checking the migration, Gateway authentication and model metadata. Do not print credentials, alter production or make a paid model request without my explicit approval. Report exactly which setup steps you verified and which remain.

Nonsecret configuration lives in the existing revision-controlled installation settings as `askAi`:

```json
{
  "enabled": false,
  "router": "vercel",
  "model": "",
  "fallbackModel": "",
  "sources": ["doc", "brief", "course"],
  "guidance": "Give clear, helpful answers in plain language. Favor brevity without sacrificing useful detail. Use one or two sentences when they fully answer the question; otherwise use up to two concise paragraphs, each with a clear purpose. Avoid dense sentences, repetition and unrelated detail. Cite only the sources needed to support the answer, usually no more than three. Say when the published Fieldbook content does not answer the question."
}
```

The established administrator settings API/MCP operation accepts this object with the current settings revision. Preserve all other settings when updating it. Omission leaves an existing AI configuration intact; explicitly set `enabled: false` to disable it. If `askAi` is absent, the feature is disabled. Public settings include only `askAiEnabled`; model selection and guidance remain administrator data. Credentials remain deployment configuration.

`sources` contains one or more distinct published kinds: `doc` (Docs), `brief` (Updates), `course` (Courses). Guidance is at most 2,000 characters and controls wording, detail, length and format. Fixed access, evidence and citation rules remain separate and take precedence. The default favors clear, helpful answers: one or two sentences when sufficient, otherwise up to two intentional concise paragraphs. Existing saved guidance is preserved on upgrade; use **Reset to default**, then **Save settings**, to adopt the current default. `model` is the saved primary ID; it may be empty while disabled but is required before enabling. `fallbackModel` is empty for None or a different explicitly selected ID. Selected models must meet the connector’s planning and answer requirements; the Vercel connector requires tool-capable text models. Existing saved primary choices remain; older settings without `fallbackModel` mean None. Nonsecret choices are included in ordinary exports/imports.

There is no built-in model or promotional expiry rule. Each operator chooses a primary and optional backup from currently available models. When a compatible primary is listed, Fieldbook sends the approved backup in Gateway’s model-fallback options. If the primary is removed from the catalog, the compatible saved backup can serve instead. If neither approved choice is usable, Ask AI fails clearly; ordinary Search remains available. Failover never rewrites the saved primary or picks an unapproved model. Runtime failures use Gateway’s bounded routing within the existing deadline; Fieldbook does not add an application retry loop or restart a partial answer. A backup cannot repair a Gateway-wide outage or exhausted Gateway credits. See [Gateway model fallbacks](https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks).

There is no application question quota or spend ledger. Each request permits one small search-planning operation and one answer operation, with 256/600 output-token bounds, no SDK retries, bounded input/evidence and a 45-second deadline. Gateway can make additional attempts on an approved fallback, billed at that model’s rates. These bounds reduce individual request size; they are **not a monthly spending ceiling**. Configure Gateway budgets at the team, project or API-key scope appropriate to your authentication, and review credit/refill behavior independently. Gateway rejects further requests after a budget is reached; updates and spend reporting have delays, so this is not an exact application spending ceiling. See [Gateway budgets](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets).

## Request and response

`POST /api/ask-ai` requires a same-origin request and follows installation access. Public guests can ask when AI is enabled; private installations require their normal signed-in access. Signed-in accounts must remain active and registered. There is no guest message quota or additional audience switch. Access, identity and AI settings are rechecked before answer generation and final citations. Disabled AI rejects the request before a model call. There are no content-editing tools or outside browsing tools.

Gateway budget refusals, exhausted credits and generation outages return “Ask AI is temporarily unavailable. Try again later or use Search.” without exposing upstream errors. Search remains usable while Fieldbook is running. A hosting-level spending action that pauses the entire deployment also takes the application offline; Fieldbook cannot render its own fallback while paused. See [Vercel Spend Management](https://vercel.com/docs/spend-management).

The API accepts AI SDK text messages only:

```json
{
  "messages": [
    {
      "role": "user",
      "parts": [{ "type": "text", "text": "How do we restore a database?" }]
    }
  ],
  "trigger": "submit-user-message"
}
```

Clients must send only recent text context. The final message must be a nonempty user question of at most 2,000 characters. The server rejects system/tool/source parts and client model/configuration overrides. It retains up to six preceding messages totaling at most 4,000 characters for this request; the request body is limited to 32 KiB. These are payload bounds, not lifetime question limits.

The response uses the AI SDK UI message stream protocol: `text-start`, `text-delta`, `text-end`, and a final `data-sources` part containing validated internal source metadata. Metadata includes the content ID, passage/lesson identity, published revision, title and an application-generated internal `href`; it excludes source bodies. Answers refer to `[S1]` IDs. Clients should build source links exclusively from final metadata, treat streamed text as untrusted plain text, and mark an interrupted/error response incomplete. Do not render model-generated HTML, images or arbitrary URLs as trusted links.

The default guidance favors only the sources needed to support the answer, usually no more than three. This is a style preference: additional supplied citations still complete. A nonempty response without citations also completes normally without a missing-source warning, including greetings and insufficient-evidence replies. Empty retrieval still reaches the same bounded answer step so greetings and clarification work regardless of punctuation; factual answers must use supplied evidence, and the model must explain when it has none. This uses the answer operation even when retrieval finds no passages. Any supplied IDs must still belong to the current evidence, and publication/access checks run before completion even without citations. Sources remain bounded by the supplied evidence (at most 12 passages); unknown IDs or changed publication revisions fail verification.

The shared chat renders verified prose citations as clickable numbers in reading order, starting at 1 for each answer. Multiple passages at the same page or lesson share one display number; separate lessons retain separate destinations. The compact source count expands to the corresponding titles. Code samples and model-written Markdown links do not become citation links. Display numbering is separate from the server source IDs and does not change verification.

Client cancellation aborts generation. Errors contain safe messages rather than provider payloads. Responses are private and uncached. No resumable stream or transcript/usage database write is implemented.

## Evidence and privacy

Retrieval reads published indexed text only, including multiple matching lessons per course and bounded matching windows in long passages. It excludes drafts, unpublished/deleted items, quizzes/answer keys and revision-mismatched index entries. Images, video, private uploaded files and outside websites are not transcribed or searched. Learning groups guide relevance and assignments, not access to published content.

The server rechecks the active account, enabled configuration and source revisions before answer generation and before final source metadata. Changes fail the answer instead of issuing current-source links for stale evidence. Already streamed bytes cannot be retracted. Valid source IDs establish link provenance, **not that every generated claim is supported**; model answers can still be mistaken. Lexical retrieval can miss differently worded content. Ordinary search remains available.

Fieldbook does not persist or log conversation text, evidence bodies or raw provider errors. Request context is sent to the configured router and selected model provider. With the current connector, these are Vercel AI Gateway and its selected upstream provider. This is not a zero-retention guarantee for those services. Review Gateway/upstream retention and training policies before sending sensitive installation content for both the primary and fallback. Catalog metadata does not enforce a route-level privacy policy. See [Gateway data handling](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr).

## Provider boundaries and verification

`lib/ai.ts` holds plain configuration, messages and source identities. `server/ports/ai.ts` defines router identity/capabilities, connection metadata, model discovery, validation, query planning and plain-text streaming; `server/ai.ts` selects the one supported implementation using server configuration. `server/ai-router.ts` enforces saved model ownership and fallback capability. Gateway calls, credentials and public model metadata caching stay in `server/providers/vercel/ai.ts`. Retrieval RPCs stay behind `server/ports/data.ts` and the Supabase adapter. The generic AI SDK UI transport does not expose Gateway types through either port. A new provider requires a working adapter, setup instructions and verification; it is not supported merely by adding a selector.

Use the repository’s risk-based checks for the affected change: focused model/server and browser tests, `pnpm typecheck`, `pnpm check:ui`, `pnpm check:providers` and both builds for a substantial AI change. Synthetic tests cover authorization, off-state/model-call admission, input bounds, cancellation, source changes/citation metadata, SDK transport and redacted failures. Embedded PostgreSQL rehearses migration/data preservation, ordinary-search compatibility, long-passage windows and service-only grants. Those tests do not prove real hosted Google sign-in, account billing, model answer quality or deployed streaming. Exercise those separately against an isolated installation before activation.

## Search and temporary conversations

When enabled, the header says **Search Fieldbook or Ask AI**. Typing and ordinary Enter still use conventional search. A question ending in `?` (after trimming spaces), followed by Enter, submits it to Ask AI. The results panel also provides an Ask AI action, including when search has no matches. The Search and Ask AI tabs let you return to search or reopen the current conversation. The X clears the query and closes the panel. An empty or whitespace-only search stays closed on focus, Enter and Arrow Down; typing a query reopens it. Clearing search text does not delete the temporary conversation.

Ask follow-up questions in the conversation field. Enter sends; Shift+Enter adds a line. Stop response cancels the request. Retry answer explicitly retries the last question after a failure, replacing its failed response. New conversation clears the thread. Source links open current content and course lessons while retaining the conversation in the workspace. Closing the panel or navigating does not erase it; reload, sign-out, account change or observing AI disabled clears it. Messages are held only in this tab's memory and are excluded from storage and exports. Only a bounded recent text context is sent for follow-ups; there is no question-count quota. Incomplete responses are labeled and excluded from later model context.

Guests in an enabled public installation can ask questions without signing in. Disabling AI restores basic search and cancels the local conversation when the changed setting reaches the shell. The server independently checks availability and access for each request.

The browser-local demo shows these entry points by default, but answers every submission with “This feature is not available in the demo site.” It makes no AI network request. The demo’s illustrative Admin toggle affects this browser’s search UI only. The installed application stays off by default. Administrator controls and the existing revision-checked settings operations configure the same nonsecret object described above.
