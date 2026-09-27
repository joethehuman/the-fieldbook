# Privacy notices belong to the installation

Fieldbook provides a policy editor, draft/publish controls, a public `/privacy` page, and links in the account menu and on sign-in pages. The operator supplies the actual notice in Settings. No personal operator identity or policy ships as a production default. Policies are stored in the installation's database, not in this repository.

Hosted policies support an email, an HTTPS contact-page link, or both. A contact page is a link to an operator-maintained page, not a built-in form or email service. Google OAuth separately requires an eligible support email; do not assume a forwarding alias automatically qualifies.

Choose a hosted Markdown policy or an existing HTTPS policy URL. Save settings to save a draft. Publish privacy policy explicitly promotes the reviewed version. Subsequent edits do not replace it until published again. Settings use revision checking to prevent overwriting concurrent edits. Unpublished text is removed from visitor and learner workspace responses. The production privacy page remains public on private installations so visitors can read it before signing in.

An external corporate policy must cover this deployment. Google brand verification may require a policy hosted on the same domain as your app. The demo's editor is browser-local and its privacy route is explicitly a preview.

## Starter outline — replace every placeholder and review before publication

- Operator and contact: [organization/person], [contact email], [site/domain].
- Scope: identify this installation, not all deployments of the open-source software.
- Data: identity from the configured sign-in provider; learning progress and quiz outcome history; feedback; uploads and content history; operational logs; connection grants.
- Purposes: authentication, learning continuity, content delivery, administration, security, and support. Explain additional purposes actually used by your organization.
- Access and recipients: administrators, infrastructure providers, approved AI connections, and external media providers. Describe employee reporting where applicable.
- Browser storage: session cookies and local guest progress; explain analytics/cookies if added.
- Retention and deletion: state actual retention schedules and a working request process. The current app has no automated retention cleanup or self-service account deletion. Content audit snapshots and storage objects need separate review when deleting an account; deleting the auth user alone is insufficient.
- Rights, applicable legal basis, international processing, and children's use: operator must determine requirements for its audience and jurisdictions.
- Changes: publication date and how material updates are communicated.

Audit your provider configuration as well as the code. Do not promise no logs, no external processing, automatic erasure, or a response deadline without operational support. Do not treat this outline as a universal compliant policy or as the software license.
