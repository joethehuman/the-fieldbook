# Roles and permissions

These rules describe the server application. The browser-local demo simulates identities and is not an authorization boundary. See the [installation guide](installation.md) for authentication setup and the [learning model](learning-model.md) for assignment behavior.

## Installation access

An installation can allow public browsing or require membership. Everyone with access can browse its published library. Learning groups personalize recommendations and assign learning; they do not restrict content visibility. Draft content and unpublished curricula are administrator-only.

Guests keep learning progress in their browser. Signed-in learners have account-backed progress. Importing browser progress rechecks answers against the current course version; local records are not trusted completion evidence.

## Accounts and reporting

- **Learners** access their own profile, progress and feedback, alongside the published library.
- **Managers** additionally report on active people in teams they explicitly manage and those teams' descendants. Team membership alone grants no reporting access. A manager without a managed team receives no additional people or progress data. Managers do not administer content, people or learning groups; feedback remains their own.
- **Administrators** manage content, settings, people, learning groups, curricula and reporting teams, and access organization reports and feedback. They can mark a current course version complete or reset progress through revision-checked, audited operations.

CSV exports use the same authorized report data and do not broaden server scope. Managers can export their team progress and person assignment details; administrator feedback and person-management details remain administrator-only. See [report exports](reporting.md).

A person has one optional reporting team. Learning-group membership is separate and can come from individual membership, parent groups or live links to teams. See [groups and curricula](learning-groups.md).

Administrators can pre-register a Google email without sending an invitation email. Verified sign-in claims that pending account even when general registration is closed. Existing sign-in emails cannot be changed through people administration. Account deactivation is distinct from deletion; hard account deletion is not exposed. Self-demotion/deactivation and removing the last active administrator are rejected.

## Enforcement and contributor guidance

The server checks identity, role and installation access before returning protected data or accepting writes. The governance snapshot scopes reporting data before serialization. Content responses for non-administrators exclude drafts and quiz answer keys. Governance writes require an administrator, validated input and the current revision; related updates and audit records are transactional.

UI visibility is not a permission check. Changes to roles, groups or reporting must preserve these boundaries and include meaningful authorization checks. Relevant entry points include `server/auth.ts`, `server/snapshot.ts`, `app/api/governance/route.ts`, and the governance server tests. Optional [MCP access](mcp-setup.md) requires an active administrator and an approved connection grant; learner and manager MCP access is not implemented.

Before using an installation, verify these rules with separate administrator, learner and manager accounts against an isolated backend. Include a manager's sibling team, anonymous/private access, draft content, stale revisions and deactivated accounts. Code inspection and demo tests do not establish that an operator's hosted authentication is configured correctly.

## Guest recommendations

Only administrators configure the optional guest learning group. Anonymous visitors receive a minimal synthetic recommendation projection of published content, never real group membership, team links or governance revisions. Public access is checked before reading the catalog. No people records, membership changes, deadlines or reporting entries are created. Signing in uses account groups; browser-progress import does not enroll an account. See [guest recommendations](guest-recommendations.md).

On public installations, visitors can rate and comment on published content. A random browser cookie lets them revise their own feedback; the server stores only its hash and labels those entries “Guest visitor” in administrator reports. Guest feedback does not create an account or learning record. The feedback API checks the site origin, publication/access and a request limit. Apply the anonymous-feedback migration before enabling this behavior on an upgraded installation.


## Managing the reporting hierarchy

Administrators use **Teams** to search and expand the hierarchy, then open a team’s **Members** or **Subteams** view. Each person has one optional direct team; including subteams shows each person once. Pending accounts are managed in People. Team membership does not grant management access.

**Create subteam** creates a new team. **Move existing team here** selects an existing branch. **Team actions → Move team** chooses a different parent or **Top-level team** to detach the branch. The review shows old/new paths, the number of teams and registered people involved, and the active managers who actually gain or lose scope. Overlapping management roots are accounted for; administrators retain organization-wide access. Self/descendant moves are rejected.

Only the branch root’s parent changes. Subteams, managers and direct memberships stay attached to their stable team IDs. Learning-group links and saved course progress are unchanged by a hierarchy move. Adding an individual to a different direct team is a separate operation and can change team-linked learning assignments.

**Delete empty team** is available only after direct members (including inactive accounts), pending-account assignments, immediate subteams and learning-group links have been removed or moved in separate saved changes. A manager assigned to an otherwise empty team does not block deletion. Deleting a team is different from detaching it. The server repeats these checks under the governance lock and retains administrator authorization, revision checks and audit history. Apply `20260923180607_guarded_team_deletion.sql` before using deletion in the server application.
