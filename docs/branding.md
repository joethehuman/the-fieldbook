# Installation branding and account pages

Administrators configure one installation identity in **Organization Settings → Identity**. The workspace, sign-in, AI consent and connection pages use that identity. There are no separate login settings or custom authentication instructions.

- **Installation name:** required, up to 60 characters. Existing installations keep their name; missing names display Fieldbook.
- **Welcome description:** optional plain text, up to 180 characters, shown beneath the application-provided sign-in instructions. Existing installations default to no welcome description.
- **Home page:** choose Updates, Courses or Docs for visits to the installation address and organization-home links. Existing installations default to Courses. Docs opens the first published article in its saved order, or the existing empty state if there are no published Docs.
- **Accent color:** a six-digit hex color used for links, selected text and feedback, focus indicators and the course progress ring. Link text is darkened only when needed for contrast on white. Neutral controls and success/error colors remain semantic.
- **Privacy-policy link:** the branding section displays the current published link. Edit and explicitly publish it in **Organization Settings → Privacy policy**, using either a hosted notice or an external HTTPS URL. Draft policy edits do not alter account-page links. See [privacy setup](privacy-setup.md).

The application has no footer or tagline setting. A published privacy policy appears in the workspace account menu and on sign-in and other account pages. Existing saved tagline values are retained for compatibility but are no longer shown or editable.

Save settings to apply branding. Settings writes require an active administrator, a same-origin request and the current settings revision. If another administrator changes the settings, reload and review before saving again. Names and descriptions are text, not HTML or Markdown.

## Public and private installations

A public installation remains browsable without signing in. Choosing sign-in opens “Sign in to [installation name]” with “Sign in to save your progress across devices” and a return-to-browsing link.

A signed-out visitor to a private installation is sent to the same branded sign-in page, with “Sign in to access your workspace” and no return-to-browsing link. The browser carries the original path, query and fragment through the sign-in entry route. The workspace endpoint still enforces private access; rendering or hiding a screen is not authorization. Initial session absence redirects without an error or diagnostic reference. An expired session during authoring recovery keeps unsaved work open instead.

Google remains the authentication provider. Local return paths are validated, remembered in a ten-minute HttpOnly SameSite=Lax cookie (Secure on HTTPS), then passed through the existing OAuth callback. Cancelled or failed sign-in retains that destination for retry. Authentication routes cannot be used as return destinations. Account denial and service failures have distinct messages; genuine failures retain a redacted server diagnostic reference. A branding-service failure shows a generic recoverable account page rather than claiming the installation is public.

Consent pages still display the connecting client, signed-in identity, requested permissions and allow/deny choices. Connection management keeps its existing administrator restriction and revoke behavior. Branding does not modify consent or provider-side OAuth branding; configure Google's name/logo separately in its console.

## What is visible before login

The server projects only the installation name, accent color, home-page choice, welcome description, published policy mode/URL and public/private access mode for account rendering. It does not send registration rules, learning configuration, revisions, people, private content or policy drafts to account pages.

The application displays the installation name without an icon. Previously saved logo references are ignored and removed the next time an administrator saves settings. The old public logo endpoint is unavailable, and ordinary `/api/media/[file]` access requires a published-content reference or administrator access. Uploaded files already in private Storage are not automatically deleted.

The public hosted privacy page remains accessible before login. No other configuration API is opened to guests. Branding uses the existing configuration JSON, so **no database migration or bucket-policy change is required**. Deploy the application normally; existing branding values remain intact.

## Demo and verification

The repository-root demo uses the shared identity/account layout with its simulated profile picker and browser-local data disclosures. It never uses Google authentication or production accounts.

The account browser suite uses synthetic provider responses and checks desktop/phone flows, redirects, branding updates, permissions, fallbacks and consent controls. It does not verify hosted Google configuration, real Supabase Storage, provider consent exchange or production behavior. Before relying on a new installation, verify a private deep link and a public sign-in through real Google authentication, denied accounts and the actual consent/revoke round trip against that installation's isolated backend.
