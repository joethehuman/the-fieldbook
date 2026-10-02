# Roles and permissions

These rules describe the server application. The browser-local demo simulates identities and is not an authorization boundary. See the [installation guide](installation.md) for authentication setup and the [learning model](learning-model.md) for assignment behavior.

## Installation access

An installation can allow public browsing or require membership. Everyone with access can browse its published library. Teams and learning groups assign learning; groups also personalize Update recommendations; they do not restrict content visibility. Draft content is available to administrators and contributors. Unpublished curricula remain administrator-only.

Guests keep learning progress in their browser. Signed-in learners have account-backed progress. Importing browser progress rechecks answers against the current course version; local records are not trusted completion evidence.

## Accounts and reporting

- **Learners** access their own profile, progress and feedback, alongside the published library.
- **Managers** additionally report on active people in teams they explicitly manage and those teams' descendants. Team membership alone grants no reporting access. A manager without a managed team receives no additional people or progress data. Managers do not administer content, people or learning groups; feedback remains their own.
- **Contributors** create, edit, publish, unpublish and recover content throughout the installation, upload authoring media, and review/export content and general feedback. They can choose existing Docs sections and Update relevance groups. They cannot change course assignments, create or reorder the Docs hierarchy, manage people/groups/curricula/settings, view organization completion reports, or recover deleted people. Restored content returns as a draft.
- **Contributors who manage teams** additionally receive the same scoped team reporting as managers. Assign a contributor as a team manager in Teams; changing a manager account to Contributor preserves its existing management assignments. Account type and explicit team responsibilities compose.
- **Administrators** manage content, settings, people, learning groups, curricula and reporting teams, and access organization reports and feedback. They can mark a current course version complete or reset progress through revision-checked, audited operations.

CSV exports use the same authorized report data and do not broaden server scope. Managers can export their team progress and person assignment details; feedback exports are available to administrators and contributors, while person-management details remain administrator-only. See [report exports](reporting.md).

A person has one optional direct reporting team. Teams form the reporting hierarchy. Learning groups are separate, flat audiences whose membership comes from individuals or live links to team branches. A new team link includes all current and future subteams; converted direct-only links keep their previous reach until explicitly expanded. Learning-group membership never grants reporting access. See [groups and curricula](learning-groups.md).

Administrators can pre-register a Google email without sending an invitation email. The person appears immediately in the People roster and team member/manager selectors, with a stable ID and separate **Not signed in** status. Verified first sign-in attaches the login to that person even when general registration is closed, preserving memberships, hire/clock dates and progress. A preregistered manager has no reporting access until that sign-in. Existing authenticated identities are never merged by email. Login emails cannot be changed through people administration. Account deactivation is distinct from deletion; hard account deletion is not exposed. Self-demotion/deactivation and removing the last active signed-in administrator are rejected.

## Panel navigation

Administrators see **Manage organization** in the account menu. Contributors see **Manage content**, opening the same panel shell, Content/Feedback tabs and editors. Its Organization Settings section contains only MCP and Recently deleted. Managers see **My team’s progress**; a contributor with a managed team sees both content and team destinations. An administrator sees the single organization destination. Direct requests repeat these permissions on the server.

Apply all missing migrations in order before assigning contributor accounts, including `20261001232329_stable_assignment_episodes.sql`, `20261001234401_contributor_permissions.sql` and then `20261002022921_flat_learning_groups.sql`. The contributor migration expands the role constraint and publishing/recovery routines, preserves existing records and team responsibilities, and retains service-role-only database access. The flat migration combines those permissions with saved assignment episodes and scoped reporting. Never replay an applied migration; see the [coordinated upgrade instructions](upgrading.md#flat-learning-group-upgrade).

## Enforcement and contributor guidance

The server checks identity, role and installation access before returning protected data or accepting writes. The governance snapshot scopes reporting data before serialization. Reader content responses exclude quiz answer keys. Draft authoring responses require publishing permission; contributor panel snapshots exclude the roster, report history, group learning rules, unpublished privacy policy and deleted accounts. Governance writes require an administrator, validated input and the current revision; related updates and audit records are transactional.

UI visibility is not a permission check. Changes to roles, groups or reporting must preserve these boundaries and include meaningful authorization checks. Relevant entry points include `server/auth.ts`, `server/snapshot.ts`, `app/api/governance/route.ts`, and the governance server tests. Optional [MCP access](mcp-setup.md) requires an active administrator and an approved connection grant; contributor, learner and manager MCP connections are not implemented by the contributor account change. The contributor MCP tab identifies that limitation; adding a role never grants MCP access by itself. MCP tools must use the same publishing permissions and explicitly managed reporting scope when role-aware connections are added.

Before using an installation, verify these rules with separate administrator, learner and manager accounts against an isolated backend. Include a manager's sibling team, anonymous/private access, draft content, stale revisions and deactivated accounts. Code inspection and demo tests do not establish that an operator's hosted authentication is configured correctly.

## Guest recommendations

Only administrators configure the optional guest learning group. Anonymous visitors receive a minimal synthetic recommendation projection of published content, never real group membership, team links or governance revisions. Public access is checked before reading the catalog. No people records, membership changes, deadlines or reporting entries are created. Signing in uses account groups; browser-progress import does not enroll an account. See [guest recommendations](guest-recommendations.md).

On public installations, visitors can rate and comment on published content. A random browser cookie lets them revise their own feedback; the server stores only its hash and labels those entries “Guest visitor” in administrator reports. Guest feedback does not create an account or learning record. The feedback API checks the site origin, publication/access and a request limit. Apply the anonymous-feedback migration before enabling this behavior on an upgraded installation.


## Managing the reporting hierarchy

Administrators use **Teams** to search and expand a compact hierarchy beside the selected team’s detail. The layout stacks on narrow screens. The **Members** view defaults to **All people**, including subteams; **Direct members** limits it to the selected team’s own roster. **Subteams** lists immediate children. Each person has one optional direct team and appears once. Preregistered people use the same roster and team controls. Team membership does not grant management access.

**Create subteam** creates a new team. **Move existing team here** selects an existing branch. **Team actions → Move team** chooses a different parent or **Top-level team** to detach the branch. One consequence review shows old/new paths, the teams and people involved, changes to course coverage, and the active managers or contributors who gain or lose reporting scope. Overlapping assignment sources and management roots are counted once; administrators retain organization-wide access. Self/descendant moves are rejected.

Only the branch root’s parent changes. Subteams, managers and direct memberships stay attached to their stable team IDs. Learning-group links keep their selected team IDs, but moving a branch can change which people those links include. Saved course progress remains intact, and continuously assigned course versions keep their deadlines. Moving an individual to another direct team similarly reviews changes to learning coverage and reporting scope.

**Delete empty team** is available only after direct members (including inactive and preregistered people), immediate subteams and all learning-group links have been removed or moved in separate saved changes. Both subtree links and converted direct-only links block deletion. A manager assigned to an otherwise empty team does not block it. Deleting a team is different from detaching it. The server repeats these checks under the governance lock and retains administrator authorization, revision checks and audit history. Apply all required migrations through the [flat learning-group upgrade](upgrading.md#flat-learning-group-upgrade) before using the matching server application.
