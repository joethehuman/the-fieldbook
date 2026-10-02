# Learning groups and curricula

Learning groups choose learning audiences. Teams represent the reporting hierarchy. Keep them separate: a learning group can include several team branches and selected individuals, such as AEs across regions or everyone serving a customer segment. Groups are flat; there are no parent or child learning groups. Published content remains available to everyone with access to the installation.

## Administration

In **Learning groups**, search the group directory or choose **Create group**. Group names must be unique within the installation; team names have their own unique-name requirement. Selecting a group opens **Learning**, with **People** and **Updates** beside it. Rename and delete are in the group’s action menu.

- **Learning → Add learning** selects published courses and curricula. Reorder the saved list with drag handles, keyboard up/down on a handle, or the move buttons. The same controls order courses inside a curriculum. Overlapping sources count each course once.
- **People → Manage membership** selects teams and individuals in one dialog. New team links include all current and future subteams. Each person appears once; **Included through** explains every matching team link and any individual membership. Removing one source leaves membership intact when another source still includes the person.
- **Updates → Add Updates** selects relevant published Updates. These tags guide the For you feed and never create completion requirements or deadlines.

An older team link can appear as **Direct members only**. It keeps its previous reach until an administrator checks **Include subteams** for that specific link and reviews the change. Editing another link does not silently expand it. New direct-only links cannot be created.

You can also start from the existing **Content** course workflow or **Curricula** and choose **Assign to learning groups**. This focused dialog selects audiences without leaving the item. There is no separate Courses administration tab. A course dialog edits its individual course links; it identifies groups that also receive the course through a curriculum. Removing an individual course link does not remove curriculum coverage. Existing group item positions stay fixed, and new links append to the group’s plan. Both entry points edit the same saved relationships.

Curricula are reusable, ordered course playlists, maintained separately from course authoring. **Create curriculum** sits beside a search for names and descriptions. Publish a curriculum when it is ready for the library and group use. Saving changes to a published playlist affects its linked groups; the editor shows how many. Unlink it before returning it to draft. Curriculum and group deletion reviews describe the affected learning; course content and completion history remain available.

Membership, assignment and hierarchy changes lead to one consequence review before saving. The summary explains added or removed course coverage and any affected reporting, Update relevance or guest recommendations; searchable details show the affected people and courses. Overlaps are counted once. Continuous assignments keep their saved dates and deadlines, and the review does not reset learning progress.

## Reporting teams

In **Teams**, search and expand the compact hierarchy, then select a team. The tree sits beside its detail on wider screens and stacks on narrow screens. **All people** is the default member view, including subteams; choose **Direct members** to manage only that team’s own roster. People are shown once with their direct team, name/email search and pagination. Subteams lists immediate children. Team paths and parent navigation keep the reporting structure visible.

**Add members** searches roster people, keeps multiple selections across searches/pages, and reviews additions or moves before applying them together. Each person has one optional direct reporting team. Removing a direct member clears that team membership; it does not delete or deactivate the account or erase progress. Inactive members remain labeled. Preregistered people appear in People and can join teams before sign-in.

Team links in learning groups follow the selected team branch. Moving a person or team can therefore change learning coverage as well as manager scope. The review accounts for both. Team IDs, attached subteams and managers, course history, and deadlines for continuously assigned courses stay stable. Managers and contributors receive team-and-descendant reporting access through explicit management assignments; administrators retain organization-wide access. Team membership alone grants none.

Team actions manage the name, parent and manager, create subteams, or move an existing branch. Parent choices exclude the team and its descendants. Unsaved changes require confirmation before leaving; saves prevent duplicate submission and retain the draft on failure. Team deletion requires separately saved removal of members, subteams and all learning-group links, including older direct-only links. See [reporting permissions](permissions.md#managing-the-reporting-hierarchy).

## Storage and upgrade

Group plans are authoritative for course assignments. A revision-checked, administrator-only governance save updates memberships, curricula, expanded course lists and affected content metadata in one database transaction, with an audit record. A person’s saved course-version assignment date and deadline survive while any assignment source remains active. No learner progress or course versions are rewritten. Update audience changes preserve both the published body and unrelated draft edits. Public browsing does not depend on group membership.

Ordinary content/MCP writes cannot change course assignments; the focused assignment dialogs use the governance save. Content editing, publication and Update targeting continue through the existing content API. Docs have no audience tags. The existing `category` field backs the course Category label.

`202609200004_learning_groups.sql` introduced curricula and ordered group `learningItems` after the earlier assignment migrations. Existing content groups/assignment rules remain the materialized result used for progress and reporting. `requiredCourseIds` is an internal ordering field for compatibility. An installation upgrading to the flat model must apply every missing migration in order, through `20261002022921_flat_learning_groups.sql`; applying only the original learning-groups migration is insufficient.

See [the flat learning-group upgrade](upgrading.md#flat-learning-group-upgrade) for the complete migration order, isolated rehearsal, coordinated deployment and rollback limits. No new environment variables or services are required. Existing browser-local demo data converts once when loaded, retaining its saved work; reset the demo only when intentionally replacing it.

## Anonymous visitors

Public installations may select one existing group, or explicitly create one, under **Organization Settings → Access → Guest recommendations**. No selection leaves For you empty while the library remains usable. Guests receive that group’s published courses, curricula and relevant Updates, without membership, deadlines or reporting entries. Team links do not enroll guests. The flat upgrade makes the selected guest group’s previously inherited learning and Update relevance explicit so its recommendations remain intact. See [guest recommendations](guest-recommendations.md).

## Stable assignments and flat conversion

`20261001232329_stable_assignment_episodes.sql` adds indexed, service-only `fb_assignment_episodes`, with one active episode per person/course/version and historical ended episodes. Profile/course foreign keys cascade during permanent deletion. Existing dates and deadlines are backfilled from saved source and membership history; missing older sources cannot be reconstructed. This migration alone does not expand existing team links or recalculate targets.

The separate `20261002022921_flat_learning_groups.sql` removes group hierarchy while preserving group/person/team IDs, current effective membership, assigned course versions, episode history and deadlines, progress, Update relevance and guest recommendations. Former ancestor groups receive explicit individual and team-link sources from their descendants. Existing subtree links remain dynamic; existing direct-only sources are stored separately without broadening their reach. Future edits to a former child group no longer propagate to its former ancestors. The converted group order preserves the prior ancestor-first recommendation priority.

Roster, learning-plan, publication and recovery writes reconcile assignment episodes inside their transaction. Compact People reads omit course obligations; selected-person and scoped learning/reporting reads include active obligations. First verified sign-in returns the same roster person and saved assignments. The flat migration also retains contributor publishing permissions and explicitly managed reporting scope. Old clients cannot safely edit this model; pause writers, deploy matching code and reload clients as described in [upgrade order and rollback](upgrading.md#flat-learning-group-upgrade).
