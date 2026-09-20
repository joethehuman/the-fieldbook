# Sign-in presentation and return navigation

The sign-in page uses a compact responsive card, a full-width Google button, and a separate row for the home and privacy links.

App sign-in links go through `/auth/sign-in`, which validates the local return path, stores it in an HTTP-only, SameSite=Lax cookie for ten minutes, and redirects to `/sign-in`. Legacy `/sign-in?next=...` links use the same flow. The cookie is consumed when Google sign-in starts; the existing validated OAuth callback return parameter remains in place. No provider configuration or database changes are required.

Validation: demo and production builds passed. All eight server tests passed, including return-path preservation and rejection of external destinations. Nineteen of twenty shared tests passed; the existing assignment-date assertion still expects September 22 rather than October 4. Checks used the available Node 24 runtime, rather than the repository's specified Node 22. Browser visual verification was blocked by the browser policy service being unavailable. Google OAuth completion was not exercised.
