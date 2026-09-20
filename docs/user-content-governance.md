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
