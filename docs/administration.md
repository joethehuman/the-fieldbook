# Administration guide

This map explains the installed application's administration areas and the decisions behind them. It is for operators and agents describing actual behavior. Use the linked guides for exact configuration, migrations and permission checks. The browser-local demo illustrates screens with synthetic data; it cannot prove hosted access, storage or reporting authorization.

## First, know what each area controls

| Area | Use it for | Read next |
| --- | --- | --- |
| Content | Draft, edit, publish, unpublish, assign and recover Docs, Updates and Courses | [Authoring](authoring.md), [content presentation](content-presentation.md) |
| People | Preregister Google emails, manage roles and status, inspect individual assignments, import a roster | [Permissions](permissions.md), [roster import](roster-import.md) |
| Teams | One hierarchy for direct membership, course/Update audience reach and explicitly managed reporting branches | [Learning model](learning-model.md), [permissions](permissions.md) |
| Learning groups | Flat, overlapping audiences from individuals and linked team branches | [Learning groups](learning-groups.md) |
| Curricula | Ordered collections of published courses for recommendations or assignments | [Learning groups and curricula](learning-groups.md) |
| Progress | Current-version assignment/completion reports, authorized drill-ins and CSV exports | [Reporting](reporting.md) |
| Feedback | Content and general responses; administrators and contributors can review/export them | [Permissions](permissions.md), [reporting](reporting.md) |
| Organization Settings | Installation identity, Docs navigation, Due dates, Access, privacy, Ask AI, MCP, external links and Recently deleted | [Sections below](#organization-settings) |

Administrators can use the whole panel. Contributors see a limited Manage content panel, with content/feedback and their permitted recovery/MCP controls. A contributor explicitly assigned as a team manager can also use the scoped team progress destination. Managers do not gain content or account administration. The server repeats every permission check; a hidden tab is not the boundary. See [roles and permissions](permissions.md).

## Content and publication

Pick the format by the reader's job: **Updates** explain a change, **Courses** teach with ordered lessons and an optional final multiple-choice check, and **Docs** keep an answer current. A Category organizes Updates and Courses; a Docs section places a document in the reading tree. Neither a Category nor a learning group is a content access list. All published content is available to everyone admitted to that installation.

The visual editor saves a **draft** automatically. Draft and published snapshots are separate; an edit does not silently change what readers see. Review the draft in the visual editor, resolve any save or upload failure, then choose Publish. Check the admitted-reader experience after publication; use an isolated installation if a full prepublication reader-flow test is needed. A publication may invalidate Search and Ask AI source revisions. For a substantive Course change, decide whether a new version should require completion again; a correction can preserve the current version. Older published Courses can retain their earlier required-quiz rule. For an already published Update, **Details → Publishing → Bring this update to the top** starts unchecked: leave it off for a correction that preserves feed position, or check it to deliberately renew Updates and For you freshness. See [authoring](authoring.md) and [learning model](learning-model.md).

Content actions and bulk deletion have confirmation and recovery rules. Unpublish removes the reader copy while keeping an editable draft; Delete starts the 30-day recovery period. Restoring deleted content returns it as a draft. See [bulk actions and recovery](bulk-actions.md). Uploaded objects are private and must be referenced only after verified transfer; see [installation media settings](installation.md#media-and-free-plan-boundaries).

## People, audiences and assignments

A person can be preregistered by exact Google email and placed in teams/groups before first sign-in. That person has a stable ID and Not signed in status. Verified first login attaches an Auth identity without creating a new Fieldbook person. General registration may be closed while preregistered people still activate. Fieldbook does not send invitation emails or support an admin-managed email/password account. Do not treat a matching email as permission to merge two existing authenticated identities.

A person has zero or one **direct reporting team**. The built-in Organization root includes people without a direct team for effective reporting and learning reach. Teams form a hierarchy, while learning groups are flat and may overlap. A group can include explicit people and live links to team branches; new links include current and future subteams. Team membership itself does not grant manager reporting. See [permissions](permissions.md) and [learning groups](learning-groups.md).

Administrators use the shared audience picker for Courses and Updates. Courses may be selected through teams, groups and curricula. Preserve each independent source: multiple paths to one person and current Course version produce one effective obligation with a saved start, policy, deadline and completion. Removing one source does not remove another. Updates use audience choices to shape For you relevance; they create no learning obligation and do not restrict access. Curricula are ordered collections, not locked prerequisites. Optional self-directed learning does not lower assigned completion. See [learning model](learning-model.md).

CSV Import in People accepts the downloadable six-column people/team template, reviews proposed changes, rejects blocking issues before applying and uses one guarded transaction. It does not synchronize an HRIS, invite users or create learning groups. Blank optional values and explicit Organization moves have different meanings; read [roster import](roster-import.md) before a bulk change.

## Progress and feedback

Progress shows current published Course versions and uses server-authorized scope. A manager sees explicitly managed branches and descendants; an Organization manager covers that whole branch without gaining administrator controls. A person with no assigned Courses has N/A, not automatic completion. Due dates add Within due dates and Overdue states; turning the setting off keeps assignment and stored targets while showing Incomplete instead. Filtered exports use the same scoped rows and must fetch all matching pages. See [reporting](reporting.md).

Feedback is a signal, not a verdict. Administrators and contributors can review content/general feedback. Public installations may accept feedback from signed-out visitors on published content; those visitors do not become people records. Check the underlying item, decide whether a correction, new Doc, Course change or response is needed, and keep the published answer accurate.

## Organization Settings

- **Identity:** installation name, optional welcome description, accent and default home (Updates, Courses or Docs). See [branding](branding.md) and [content presentation](content-presentation.md).
- **Docs:** two-level section/subsection navigation. Documents can sit at either level; settings can move/reorder them and save a reviewed draft of the hierarchy. See [authoring](authoring.md).
- **Due dates:** on/off, onboarding and catch-up windows. Changed defaults affect future assignments; use Review existing deadlines for an explicit recalculation. See [learning model](learning-model.md).
- **Access:** public or members-only browsing, registration and an optional guest recommendation group. Published content follows installation access, while group selection guides relevance. See [guest recommendations](guest-recommendations.md).
- **Privacy:** write and publish a notice for this installation's real services and practices. The maintainer's notice is not an operator default. See [privacy setup](privacy-setup.md).
- **Ask AI:** optional, off by default. Select a supported router in deployment configuration, then choose models, published source kinds and answer guidance in Admin. See [Ask AI](ask-ai.md).
- **MCP:** configure and review authenticated AI-client access, consent and revocation. The external OAuth server also needs operator setup. See [MCP setup](mcp-setup.md).
- **External links:** up to three account-menu links, shared across roles and public guests. See [branding](branding.md).
- **Recently deleted:** restore eligible content/people during the 30-day window. Permanent cleanup depends on the installed worker. See [bulk actions](bulk-actions.md).

For a new installation, complete [independent installation proof](installation-proof.md) before relying on these workflows with important content. Successful source tests or a demo walkthrough do not establish that the chosen hosted services and account settings work together.
