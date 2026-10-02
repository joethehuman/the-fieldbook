# Ask AI server foundation

This snapshot adds an optional, authenticated question-answering API using the Vercel AI SDK and AI Gateway. It is **off by default**. The learner chat interface and Admin configuration controls are not included in this snapshot; ordinary search and the browser-local demo are unchanged.

## Installation and configuration

Use the supported [Vercel + Supabase + Google installation](installation.md). Apply `supabase/migrations/20261002011512_ask_ai_passages.sql` after all earlier migrations, first on an isolated backend. It adds two read-only, service-role-only functions over the existing published search index. It creates no new tables and does not change content, settings, profiles, progress or ordinary search. Older application code remains compatible. Apply each migration once and record it; code rollback can leave these functions in place.

Gateway uses Vercel project authentication automatically. An operator needs their own Gateway-enabled Vercel account and an available model. Local execution can use an expiring Vercel OIDC token from `vercel env pull`, or a server-only `AI_GATEWAY_API_KEY`. Never put either credential in site settings, a browser variable or an AI prompt. No separate model-provider account/key is required for Gateway-managed access. See [Gateway OIDC](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc) and [API keys](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys).

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

`lib/ai.ts` holds plain configuration, messages and source identities. `server/ports/ai.ts` defines validation, query planning and plain-text streaming; `server/ai.ts` composes the one supported implementation. Gateway calls, credentials and public model metadata caching stay in `server/providers/vercel/ai.ts`. Retrieval RPCs stay behind `server/ports/data.ts` and the Supabase adapter. The generic AI SDK UI transport does not expose Gateway types through either port. A new provider requires a working adapter, setup instructions and verification; it is not supported merely by adding a selector.

Run `pnpm test`, `pnpm typecheck`, `pnpm check:providers` and both builds. Synthetic tests cover authorization, off-state/model-call admission, input bounds, cancellation, source changes/citation metadata, SDK transport and redacted failures. Embedded PostgreSQL rehearses migration/data preservation, ordinary-search compatibility, long-passage windows and service-only grants. Those tests do not prove real hosted Google sign-in, account billing, model answer quality or deployed streaming. Exercise those separately against an isolated installation before activation.
