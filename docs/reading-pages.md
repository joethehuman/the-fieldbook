# Reading pages and link metadata

The server application renders published Docs (`/docs/:id`), Updates (`/updates/:id`) and course overviews (`/courses/:id`) on the server. Existing section aliases remain supported. Courses list their lessons and link to the existing interactive player with `?lesson=:lessonId`; curriculum context is preserved. Search keeps its published item and lesson destinations. The browser-local demo continues to use its own local data.

## Access and response behavior

The installation’s existing public/private setting controls reading pages; there is no separate SEO or public-site configuration. Anonymous public requests can read only published snapshots. Private requests verify the account on the server before querying the item. Signed-out or disallowed accounts go through the branded sign-in flow with their destination preserved. Missing, deleted, unpublished, wrong-type items and missing lesson destinations produce a real HTTP 404. Provider failures remain server errors, not missing pages.

Docs and Updates lists and articles use a small published index and one published body read for a detail page. Their layout, page and metadata share request-local React `cache` lookups. The server checks session, installation access, publication and item type before rendering. Groups guide Updates recommendations, never content access; real group metadata is not sent to guests. No draft snapshot, quiz answer key, learner progress or administration record enters the reader payload. A signed-in account's display name appears in its private, no-store HTML. Feedback loads separately from the article through an authorized lookup and saves through the existing endpoint. These routes never load `/api/workspace`.

Docs and Updates use Next links for list cards, the document tree, breadcrumbs, search results and previous/next links. A single reader layout keeps the app bar and sidebar mounted while navigating within and between the two sections. Direct URLs and links without JavaScript still render server HTML. Dynamic article links wait for fresh server content; there is no persistent article prefetch cache or per-link loading text. An Update article skips the list-index read after the reader layout is already mounted. Course playback, checks and progress still use the existing interactive workspace and server grading. Guest progress remains in the browser and import after sign-in stays explicit. The existing unsaved-edit guard still protects navigation out of authoring and administration.

## Metadata and caching

Each readable item supplies a title, description, canonical URL, Open Graph and Twitter summary metadata. URLs use the configured trusted application origin. If an installation has a logo, metadata uses its existing public branding endpoint; no item media, expiring Storage URL or generated image is required. Without a logo, previews use text metadata. Private authorized pages are marked noindex; anonymous private requests receive only generic metadata and the approved public sign-in identity.

Reading routes are dynamic and server database fetches explicitly use `no-store`. Responses are private/no-store; React memoization lasts only for the current request. No ISR, persistent data cache or shared user cache is introduced. Metadata streaming is disabled so access/existence checks finish before HTTP headers are committed, including for regular browsers. The shared reader layout rejects unavailable items on direct HTML requests before rendering the shell to preserve real 404 responses; client navigation rechecks them in the page. Browser back/forward within the reader uses Next client navigation while retaining request-time access checks.

The next request reflects publishing, editing, unpublishing, deletion or switching access mode. Content already delivered to an open page cannot be recalled. Application cache controls cannot remove third-party preview caches or copies previously downloaded by a visitor. Operators should not add CDN caching rules that override the application’s private/no-store headers.

Cookie sessions are refreshed in the Next.js request proxy for reading routes, before Server Components run. The proxy does not trust the cookie session as identity; normal server authorization still verifies the user and active profile. The independent configuration read starts alongside user verification, and the access rule runs before any item or index read. Reading components use a read-only cookie client; APIs retain their existing cookie-writing behavior.

## Verification

Run `pnpm test:reading` after both builds, using the synthetic production build values documented in CONTRIBUTING. It exercises the built application against a local protocol fixture, including raw HTML/metadata/status checks, public/private transitions, redaction, simulated session refresh, no-JavaScript rendering and desktop/phone interactions. It uses the same local fixture ports as account tests, so run suites sequentially. No hosted credentials are needed or permitted.

These checks do not establish hosted Google OAuth, production provider behavior, search-engine rankings or actual third-party previews. No migration or extra service is required. Sitemaps, robots expansion and SEO administration remain outside this behavior.

## Docs reading navigation

Docs use left-aligned section/folder navigation with the current document highlighted. On desktop the document tree scrolls independently of application navigation and account controls. Tab-local scroll/disclosure preferences are optional and do not change document order or access. Short screens and larger text retain an outer-sidebar scrolling fallback.

Articles with H2/H3 headings have an **On this page** outline. It stays beside the article on wide screens and becomes a compact disclosure on smaller screens. Headings have shareable links; repeated headings receive unique suffixes. These links derive from the rendered Markdown rules, so code examples are never mistaken for headings. Editing a heading can change its anchor; unchanged headings retain their anchors unless an earlier duplicate changes their suffix.

Previous and next links follow the same published document sequence as the sidebar, crossing section and folder boundaries. Search and collapsed sections do not change the sequence. The first and last document omit their unavailable direction. Publication changes appear on the next server request without a workspace load.

The server authorizes access before fetching the compact Docs and Updates index. The paginated read projects only published navigation, card, ordering and recommendation fields; the server discards group IDs before serializing reader data. Content and metadata remain request-time, without a persistent user/content cache. Index fields scale with catalog size; this is not a transactional snapshot across simultaneous publication changes. A document unpublished after rendering returns the existing missing-page response when opened.

Run `pnpm test:reading` after both builds for server HTML/private redaction, publication changes, no-JavaScript links, repeated-heading fragments, browser history, large document trees and responsive reading checks. Fixtures use synthetic local services, not hosted authentication or production data.
