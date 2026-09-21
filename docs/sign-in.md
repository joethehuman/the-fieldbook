# Sign-in presentation and return navigation

The sign-in page uses a compact responsive card, a full-width Google button, and a separate row for the home and privacy links.

App sign-in links go through `/auth/sign-in`, which validates the local return path, stores it in an HTTP-only, SameSite=Lax cookie for ten minutes, and redirects to `/sign-in`. Legacy `/sign-in?next=...` links use the same flow. The cookie is consumed when Google sign-in starts; the existing validated OAuth callback return parameter remains in place. No provider configuration or database changes are required.
