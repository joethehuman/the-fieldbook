# Installation link-sharing cards

Every installed Fieldbook uses one 1200 × 630 PNG for Open Graph and large-image Twitter previews. Its Paper layout uses Geist, a light background, the saved public accent, installation name and canonical domain, three outlined pages and four equal, evenly spaced lines. There is no bottom-right accent mark.

## Public identity and private content

The image endpoint `/api/og?v=1` reads only the existing pre-login branding projection. Public and private installations use the same identity rules. The card reveals the name and accent already intended for signed-out account pages, plus the configured domain. It never reads content, titles, summaries, lesson information, images, teams, people, reports or publication state. Query parameters, content IDs, cookies and caller-supplied hosts do not choose the image's contents.

All links within one installation use the same image URL. Anonymous requests to private content still follow the existing sign-in flow, with no private item metadata or existence disclosed. Authorized readers retain their existing title and description metadata; public published pages retain their published metadata. The PNG is always the universal installation card.

The PNG is generated from current public identity on every request and returned with `Cache-Control: no-store`. Identity changes affect subsequent image requests. A branding-service failure uses Fieldbook's default identity and accent, keeping the configured domain when available. Third-party preview services may retain previously fetched images; application headers cannot recall those copies. The card cannot make a network-restricted or externally password-protected deployment reachable by a preview service.

The optional static demo exports the same layout at `/og.png` at build time with The Fieldbook identity and its configured `FIELDBOOK_URL` (or branch origin on Vercel Preview). Vercel's production domain/deployment URL is the build-time fallback when no explicit demo URL is supplied. Browser-local edits cannot change the static social image. When no demo origin is available, the card omits the domain rather than inventing one.

## Template boundary

`lib/og-card.ts` defines the entire safe `OgCardIdentity` contract: `name`, `domain` and a validated six-digit hex `accent`. `lib/og-card-template.tsx` is a pure renderer; it has no settings, service calls or account/content data. Server projection, PNG generation and metadata wiring stay separate. This boundary supports later template customization without giving a template access to private data.

There is no Admin template editor, Copy prompt action, executable snippet support or per-item card setting in this version. Those features require separate design and implementation. Do not execute pasted JavaScript or add arbitrary fetches to the public renderer.

Next.js is patched to 16.3.6 in both packages before introducing Node `ImageResponse`, addressing GHSA-vcvr-r3jv-pc5j. The template uses normal text and bounded color values, with no raw SVG interpolation or remote assets. Fonts come from the installed Geist package and retain its license. No database migration, new service or provider setting is needed.

## Verification

The focused server test checks the identity contract, public/private equivalence, projection and failure fallback. `pnpm test:og` checks the built PNG, dimensions, query independence, zero content reads, private redirects/redaction, metadata inheritance, identity updates, fallback and static demo image. Rendered examples include the approved short name and a long installation name.

These tests use a synthetic local backend. They do not establish real third-party preview rendering, hosted authentication, deployment completion or instantaneous external-cache refresh.
