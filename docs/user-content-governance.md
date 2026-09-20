# Production governance

## Audit and scope

Baseline: private `joethehuman/the-fieldbook`, main `26af994d1be8fd7157fb4b08e09a7e3ad69d8ff4`. Demo hierarchy/deadline helpers and admin forms exist. Production hides management tabs, rejects governance saves, strips assignments, and exposes reporting only to admins. Tables are server-only; browser roles have no access. Keep that authorization boundary.

## Permission contract

- Active administrators manage profiles, roles, memberships, nested groups and teams, assignments, and all reporting. Self-demotion/deactivation and removal of the last active administrator are rejected. No hard account deletion.
- Pre-register an email without sending mail. A verified Google sign-in claims that pending profile even when registration is closed. Existing login emails are immutable. Pending profiles can be edited or revoked. No passwords, impersonation, or automatic email delivery.
- Learners see their own profile, assignments and progress. Managers additionally see active people and course progress in explicitly managed teams and descendants. Merely belonging to a team grants nothing. Manager role without a managed team grants no additional data. Managers cannot administer users, groups, teams, assignments or content; feedback remains self-only.
- A team has one optional parent and one optional active manager/admin; a person has one optional reporting team. A manager may lead multiple teams. Group membership and reporting membership are independent.
- A group has one optional parent. People can belong to multiple groups and inherit parent assignments. Reject missing references, duplicate names, self-parenting and cycles. Removal is deferred: rename/reparent groups and teams, remove memberships and assignments, or deactivate accounts instead.
- Every published item is visible under the site's public/member access setting. Groups never gate browsing. Drafts, quiz answers and unrelated people/progress remain private.
- Assignments take effect on publication. No deadline, fixed UTC calendar date, or 1–3650 days from the later of assignment publication and effective group membership. Earliest applicable deadline wins. Due today is not overdue until the next UTC day. Membership removal/re-add starts a new interval. Reparenting starts newly acquired inherited memberships now and preserves continuously held memberships. Unpublishing suspends assignments; republishing starts a new assignment interval. Completion uses the latest published course version; assignment/deadline edits alone do not reset progress.
- Governance saves are atomic, revision checked and audited. Membership and assignment timestamps come from the server. Server-scoped snapshots prevent cross-team data from reaching the browser. No production database mutation or main merge is included.

## Validation and preview

Exercise schema/hierarchy failures, active-admin protections, stale writes, direct database privilege denial, pending email claim, inheritance/reparent/rejoin dates, course publication, and manager sibling isolation. Build both applications. Preview must use a dedicated Supabase project and synthetic accounts; never copy production learner data. Apply migrations only to that isolated backend, seed sample hierarchies and courses, then verify authenticated roles in the browser. Live OAuth and deployment checks remain separate from local test results.

## Implemented storage and limits

This additive migration keeps the existing JSON hierarchy/membership model. `fb_config.governance_revision` serializes governance changes; database routines validate hierarchy/reference integrity and audit changes in the same transaction. `fb_profiles.effective_group_joined_at` records continuous inherited membership independently from direct membership. `fb_pending_profiles` holds unclaimed accounts. A service-only SQL snapshot scopes reporting before serialization and avoids the API's per-table 1,000-person truncation. The existing catalog and feedback queries retain their documented 1,000-row limit; this remains a small-instance application. Group/team deletion and hard account deletion are intentionally not exposed.

Preview backend created: `fieldbook-governance-preview` (Supabase ref `lmcrlobrxyxgwsyayhbb`, Vercel storage `store_NsdevmvTq6jzh859`). It is separate from the live Fieldbook backend. Do not configure its credentials on the production application.


## Reusable Preview authentication

Vercel Preview credentials point only to the isolated backend. The app uses the trusted `VERCEL_BRANCH_URL` in Preview and retains `FIELDBOOK_URL` for production/local use. Login first redirects to that canonical host before setting the PKCE cookie, so the callback uses the same host. Review through the branch URL.

One dedicated Google web OAuth client should use callback `https://lmcrlobrxyxgwsyayhbb.supabase.co/auth/v1/callback`. Configure that client only on the isolated Supabase project. Supabase's allowed application redirect URLs must include the reviewed Preview branches' `/auth/callback` URLs; Google does not need a separate client per Vercel deployment. Keep the allowlist restricted to this project's Preview hosts; never allow arbitrary vercel.app projects.

Hosted migrations and sample data have been applied to the isolated backend. Vercel Preview configuration and a successful redeployment are confirmed; the guest library displays both sample courses. Dedicated Google provider configuration and authenticated role verification are still pending.

## Assignment management iteration

Assignments can target one group (including descendants and future members) or one person. The workspace Assignments view, group/person detail views and course builder all manage the same published rules. Assignment-only edits preserve unpublished lesson edits. Multiple applicable rules yield one learner course and the earliest deadline. Unassigning removes only that source and never clears progress.

Administrators can mark a person complete or reset their current published course version from assignment details or the person’s learning view. Completion records all lessons complete and a passing completion without fabricating a quiz attempt. Reset clears current-version lessons, completion and attempts; older versions remain intact and the audit stores before/after state. Both actions require confirmation, server-side admin authorization, current document revision and current progress revision. Managers retain reporting-only scope.

Apply `202609200002_assignments.sql` after the governance migration. It adds progress revisions, individual assignment validation, and an audited service-only learning-management RPC. Apply to the isolated Preview database first; production remains approval-gated.
