# Ask AI

Ask AI adds optional, authenticated answers from published Fieldbook content using the Vercel AI SDK and AI Gateway. It is **off by default** in installed applications. The search panel includes temporary conversations when enabled. Administrators configure it under **Organization Settings → Ask AI**. The browser-local demo shows the same controls with an illustrative model; all answers remain local unavailable responses.

## Installation and configuration

Use the supported [Vercel + Supabase + Google installation](installation.md). Apply `supabase/migrations/20261002011512_ask_ai_passages.sql` after all earlier migrations, first on an isolated backend. It adds two read-only, service-role-only functions over the existing published search index. It creates no new tables and does not change content, settings, profiles, progress or ordinary search. Older application code remains compatible. Apply each migration once and record it; code rollback can leave these functions in place.

### Turn it on in your installation

1. Complete the ordinary [installation](installation.md) with your own Vercel, Supabase and Google accounts. Sign in to Fieldbook as an administrator. AI off requires no Gateway key or account connection, and enabling AI does not change Google sign-in or Supabase credentials.
2. Apply the migration above to your isolated preview backend before deploying/testing this code there. For an existing live installation, back up and rehearse first, then apply the additive migration before its code deployment. Follow [upgrades](upgrading.md); Vercel does not run SQL automatically.
3. In the Vercel **team that owns your Fieldbook project**, open **AI Gateway**. Review credits, payment/refill settings and permitted models. Deployed Vercel projects use automatic project OIDC authentication when no Gateway API key is set; you do not need a separate upstream provider account/key for Gateway-managed access. Free credits can have account/payment requirements. See [Gateway setup](https://vercel.com/docs/ai-gateway/getting-started) and [OIDC](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc).
4. In Fieldbook, open **Manage organization → Organization Settings → Ask AI**. Choose a model and review its price, expiry and data handling. Choose published sources; edit Answer guidance if needed. Reset to default restores the concise guidance.
5. **Check setup** reads public model metadata and checks both retrieval functions with empty inputs; it generates no answer and reads no published bodies. A configured key/project and a loaded catalog do **not** prove authentication. Resolve any missing-connection or migration message.
6. Click **Test answer** to verify access to the selected model, forced tool use and a cited answer using synthetic text. It uses your current draft guidance, works with learner AI off, makes up to two small model calls and may incur charges. It saves no settings and sends no installation content. Success establishes connectivity and basic response format, not answer quality across your library.
7. Switch **Enable Ask AI** on and **Save settings**. Enabling or changing an enabled model validates availability and retrieval without generating text. Try a question about known published content from the header. Switch off and save to return to basic search; disabling remains available when Gateway is down. A stale save fails rather than overwriting a newer administrator's changes.

The model menu is built from Gateway's live public catalog, filtered to text models supporting tool use. It shows six low-cost choices ordered by combined input/output token price, plus the default and saved model when available. Metadata is cached for up to five minutes. Missing prices and privacy guarantees are reported as unknown, never assumed. The selected model applies installation-wide; learners do not pick models. There is no automatic model fallback.

### Server API key alternative

For local development or an environment without Vercel OIDC, open your Vercel team's **AI Gateway → API Keys**, create a key and copy it directly into the server environment as `AI_GATEWAY_API_KEY`. On Vercel, use **Project → Settings → Environment Variables**, select only the intended environment, and redeploy. Locally, use an ignored root `.env.local` and restart the server. Never put the key in site settings, a `NEXT_PUBLIC_` variable, an export, an AI prompt or a screenshot. If a key is set it takes precedence over OIDC. See [API keys](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys).

Alternatively, local Vercel development can use `vercel link` and `vercel env pull`; pulled OIDC tokens expire and need refreshing. The adapter can call Gateway from another host with a server key, but Fieldbook currently documents and verifies only its Vercel/Supabase/Google stack. Changing the entire hosting/router stack requires a separate supported recipe.

An operator can give a setup agent this request:

> Follow docs/installation.md and docs/ask-ai.md for my Fieldbook installation. Identify my own Vercel project and isolated Supabase environment first. Keep AI off while checking the migration, Gateway authentication and model metadata. Do not print credentials, alter production or make a paid model request without my explicit approval. Report exactly which setup steps you verified and which remain.

Nonsecret configuration lives in the existing revision-controlled installation settings as `askAi`:

```json
{
  "enabled": false,
  "model": "inclusionai/ling-3.1-flash-free",
  "sources": ["doc", "brief", "course"],
  "guidance": "Answer directly and briefly. Use one or two sentences when that is enough. Otherwise use at most two short paragraphs, with up to three useful source links. Include only detail needed to answer the question. Say when the available Fieldbook content does not contain the answer."
}
```

The established administrator settings API/MCP operation accepts this object with the current settings revision. Preserve all other settings when updating it. Omission leaves an existing AI configuration intact; explicitly set `enabled: false` to disable it. If `askAi` is absent, the feature is disabled. Public settings include only `askAiEnabled`; model selection and guidance remain administrator data. Credentials remain deployment configuration.

`sources` must contain one or more distinct published content kinds: `doc` (Docs), `brief` (Updates), `course` (Courses). Guidance is at most 2,000 characters and supplements the fixed access, evidence and citation policy. The configured model must be an available Gateway text model supporting tool use; unavailable or incompatible models fail without changing to another model.

The initial model is a managed promotional free model. Vercel states that **`inclusionai/ling-3.1-flash-free` stops serving after October 13, 2026**, rather than starting to charge. Choosing the regular model ID has different billing behavior. Review current availability, price and data handling before enabling or changing a model. See the [free model](https://vercel.com/ai-gateway/models/ling-3.1-flash-free) and [announcement](https://vercel.com/changelog/ling-3-1-flash-is-now-available-on-ai-gateway).

There is no application question quota or spend ledger. Each request permits at most one small search-planning call and one answer call, with 256/600 output-token bounds, no SDK retries, bounded input/evidence and a 45-second deadline. These reduce individual request size; they are **not a monthly spending ceiling**. Gateway budgets are soft limits: the request crossing a limit can complete. Configure account/project spending and credit/refill behavior independently. See [Gateway budgets](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets).

## Request and response

`POST /api/ask-ai` requires a same-origin request, the existing signed-in session, and an active registered Fieldbook reader. Public installation access does not grant anonymous AI access. Disabled AI rejects the request before a model call. There are no content-editing tools or outside browsing tools.

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

Client cancellation aborts generation. Errors contain safe messages rather than provider payloads. Responses are private and uncached. No resumable stream or transcript/usage database write is implemented.

## Evidence and privacy

Retrieval reads published indexed text only, including multiple matching lessons per course and bounded matching windows in long passages. It excludes drafts, unpublished/deleted items, quizzes/answer keys and revision-mismatched index entries. Images, video, private uploaded files and outside websites are not transcribed or searched. Learning groups guide relevance and assignments, not access to published content.

The server rechecks the active account, enabled configuration and source revisions before answer generation and before final source metadata. Changes fail the answer instead of issuing current-source links for stale evidence. Already streamed bytes cannot be retracted. Valid source IDs establish link provenance, **not that every generated claim is supported**; model answers can still be mistaken. Lexical retrieval can miss differently worded content. Ordinary search remains available.

Fieldbook does not persist or log conversation text, evidence bodies or raw provider errors. Request context is sent to Gateway and the selected upstream provider. This is not a zero-retention guarantee for those services. Review Gateway/upstream retention and training policies before sending sensitive installation content; the initial Ling route does not advertise zero-data-retention or no-training guarantees in the current catalog. See [Gateway data handling](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr).

## Provider boundaries and verification

`lib/ai.ts` holds plain configuration, messages and source identities. `server/ports/ai.ts` defines connection metadata, model discovery, validation, query planning and plain-text streaming; `server/ai.ts` composes the one supported implementation. Gateway calls, credentials and public model metadata caching stay in `server/providers/vercel/ai.ts`. Retrieval RPCs stay behind `server/ports/data.ts` and the Supabase adapter. The generic AI SDK UI transport does not expose Gateway types through either port. A new provider requires a working adapter, setup instructions and verification; it is not supported merely by adding a selector.

Use the repository’s risk-based checks for the affected change: focused model/server and browser tests, `pnpm typecheck`, `pnpm check:ui`, `pnpm check:providers` and both builds for a substantial AI change. Synthetic tests cover authorization, off-state/model-call admission, input bounds, cancellation, source changes/citation metadata, SDK transport and redacted failures. Embedded PostgreSQL rehearses migration/data preservation, ordinary-search compatibility, long-passage windows and service-only grants. Those tests do not prove real hosted Google sign-in, account billing, model answer quality or deployed streaming. Exercise those separately against an isolated installation before activation.

## Search and temporary conversations

When enabled, the header says **Search Fieldbook or Ask AI**. Typing and ordinary Enter still use conventional search. A question ending in `?` (after trimming spaces), followed by Enter, submits it to Ask AI. The results panel also provides an Ask AI action, including when search has no matches. The Search and Ask AI tabs let you return to search or reopen the current conversation.

Ask follow-up questions in the conversation field. Enter sends; Shift+Enter adds a line. Stop response cancels the request. Retry answer explicitly retries the last question after a failure, replacing its failed response. New conversation clears the thread. Source links open current content and course lessons while retaining the conversation in the workspace. Closing the panel or navigating does not erase it; reload, sign-out, account change or observing AI disabled clears it. Messages are held only in this tab's memory and are excluded from storage and exports. Only a bounded recent text context is sent for follow-ups; there is no question-count quota. Incomplete responses are labeled and excluded from later model context.

Guests in an enabled public installation are prompted to sign in on an explicit AI attempt. Disabling AI restores basic search and cancels the local conversation when the changed setting reaches the shell. The server independently checks availability and access for each request.

The browser-local demo shows these entry points by default, but answers every submission with “This feature is not available in the demo site.” It makes no AI network request. The demo’s illustrative Admin toggle affects this browser’s search UI only. The installed application stays off by default. Administrator controls and the existing revision-checked settings operations configure the same nonsecret object described above.
