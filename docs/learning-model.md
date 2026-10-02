# Learning model

Everyone with access to an installation can explore its full published library. Teams assign courses and curricula; learning groups provide custom learning audiences and personalize Updates; they never control content visibility. Drafts retain their editorial protections. Organization access settings still determine whether sign-in is needed to enter an installation.

## Groups, categories and curricula

- A learning group answers “who is this for?” Groups are flat, and people can belong to several groups through individual membership or linked teams. New team links include the linked team and its current and future subteams. Older direct-only links retain that reach until an administrator explicitly reviews their expansion. There is no membership or learning inheritance between groups. Teams retain their hierarchy and govern manager reporting independently.
- A category organizes courses in the library. Each course has one category. It does not determine assignments.
- A curriculum is a named, ordered playlist of courses. Published curricula can be browsed by everyone and assigned to teams and learning groups. Draft curricula are only available to administrators. Curricula are maintained in their own admin tab.
- A learning group's sequence can contain both courses and curricula. The combined recommendation follows saved group order, then each group's saved item order and each curriculum's course order. The flat upgrade preserves the previous ancestor-first group priority in that saved order. A course encountered more than once appears once in the combined recommendation. Courses are never locked.

Administrators manage each group through **People**, **Assigned Courses** and **Assigned Updates**, starting with People. **Add Members** selects teams and individuals; **Assign Courses** selects courses and curricula. The existing Content and Curricula workflows offer a shared **Assign to teams or groups** picker. These controls edit the same saved plan and review consequential changes before saving. See [learning group administration](learning-groups.md#administration).

## Organization and reporting teams

Every installation has one built-in **Organization** team. Top-level teams belong directly beneath it; each other team has one parent. Organization is available through the visible **Organization** button on Teams and does not occupy a column in the team browser.

A person can have one direct team or leave that field blank. People without a named team automatically appear at Organization. Its page manages the organization manager and these people, including preregistered accounts. Moving someone into a team changes their reporting location; removing them from a named team returns them to Organization. The Organization manager can report on active people across every team, including those without a named team. Other managers see only the branches they manage.

Linking Organization to a learning group includes everyone in the hierarchy, including people without a named team. This is derived membership: their optional team field remains blank, overlapping assignments count once, and a continuously assigned course keeps its deadline. Existing direct-only links retain their direct reach.

Anonymous visitors are outside the reporting hierarchy. Public installations can select a dedicated Guests learning group under Access → Guest recommendations. Guests have no roster entries, deadlines or manager reports; their progress stays in their browser.

## For you and completion

The Courses page starts with For you for signed-in users, then offers published curricula and the full course library. The home For you queue shows unfinished team- or group-selected courses or curriculum cards and a completion summary. The card reports completed designated courses divided by all currently published designated courses. A valid completion counts regardless of where the learner originally took the course. A percentage is never rounded to 100 while a course remains unfinished. People with no designated learning see no completion ring; the card shows any in-progress or completed courses and links to Your courses when there is activity. When due dates are off, the learner-facing summary calls these courses recommended; its count and percentage remain the same.

### Browsing courses and personal activity

“View all for you” opens the shared course browser with **Assigned** selected for signed-in learners when due dates are on, **Recommended** when they are off, or **For you** for guests. It contains team- or group-selected published courses and curriculum cards, including completed cards; the curriculum presentation rules below describe how these are combined. Guest-group items remain recommendations and do not gain a card label. **Hide completed** defaults off and filters only this view. The home For you row shows unfinished cards in recommended order; a curriculum card opens its ordered course list.

The browser also provides **Your courses** (team- or group-selected courses plus any other course started or completed on its current version), **In progress** (any started, unfinished course), **Completed** (all current-version completions), and **All courses** (the published course library). A quiet Assigned or Recommended marker appears on team- or group-selected course cards in signed-in browser views, following the due-date setting; other cards have no marker. Switching views clears search/category filters and resets Hide completed. Search and sorting apply within the selected collection. These views use the same saved progress; they do not enroll learners or change group selections.

Activity means a valid completed lesson or recorded quiz attempt on the current course version. Merely opening a course or having an empty progress record does not make it in progress. Course-card rings count completed lessons and final course completion as one last step. The last lesson completes a course without a quiz; the final quiz submission completes a course when its rule allows it. The finish screen then offers optional feedback and Close course. A quiz is eligible after any full submission unless Require all answers correct to complete is on, in which case a fully correct attempt is required. Older published quizzes retain their prior all-correct rule. Each new attempt stores selected stable option IDs, per-question correctness, overall correctness, version and time. Legacy summary-only attempts and earned completions remain valid without invented answer details. Curriculum indicators count completed published courses in their playlist. Empty curricula do not show earned completion.

Self-directed activity never changes the assigned completion percentage. Someone who has completed all five assigned courses and started another stays 100% complete, with that course available in Your courses and In progress. Completed assigned courses remain available in the Assigned and Completed views.

Course-row arrows appear only when the row overflows and are disabled at each unavailable endpoint. Resizing and course-list changes recalculate their state. Compact progress indicators are shared UI primitives, with text status as well as color.

The Updates page shows up to two recent published updates for the signed-in viewer's effective groups, or the configured guest group for signed-out visitors. Below that, the full published Updates library continues in the same order, excluding only the updates already featured; older relevant updates remain in the library. The library reveals ten more items at a time, without fetching another page because the catalog is already loaded. An update appears at most once. Updates have no completion requirement and do not affect course completion or deadlines. Users without matching groups see the full library without a For you section.

The current content model does not store a first-publication timestamp. Ordering therefore uses the timestamp on the published snapshot (`updatedAt`), falling back to a valid creation timestamp and then a stable ID order for undated items. Draft-only edits do not change the published snapshot or move an update. Republishing an edited update does change its published timestamp and can move it higher in the feed. A separate first-publication date would require a future data-model change.

Docs are organized by their navigation, without learning-group targeting.

Fieldbook does not enforce completion, grant rewards, lock prerequisites, or trigger consequences. Recognition and organizational practices around the percentage are managed outside the platform.

## Completion windows

Organization Settings → Due dates has an on/off control, an onboarding window (90 days by default) and a catch-up window (30 days by default). Existing installations keep due dates on unless an administrator turns them off. Off keeps both saved window values and group selections but removes target/overdue status; administrators can still edit the windows for future clocks and assignments. Windows provide timing context, not access restrictions or expiration of assignments.

The hire date starts onboarding, using the onboarding window applied when that person's clock is first set. People shows **New user** through the end date and **Existing user** from the following UTC day. This stage is calculated independently of sign-in, access role and the due-date toggle. A person without a recorded hire/legacy clock date is Existing; first sign-in never invents a hire date. Historical onboarding starts remain recorded and serve as the baseline until an administrator supplies a confirmed hire date. Editing the hire date shows the changed onboarding end before saving and preserves completion history.

A person's effective course-version assignment starts when coverage first takes effect, including before sign-in. Its start date, deadline and applied policy are saved together. The target is the later of assignment start plus catch-up days and the person's applied onboarding end. Dates use UTC. With 90-day onboarding and seven-day catch-up, assignments on hire days 60 and 83 are due on day 90; day 84 is due on day 91; day 90 is due on day 97. After onboarding, new assignments use the catch-up window.

Changing either default affects future clocks/assignments. Existing deadlines stay fixed across overlapping teams, groups, curricula and team links, even when the original source is removed. Organization Settings → Due dates → **Review existing deadlines** previews recalculation using saved defaults. It changes active people's onboarding ends and unfinished course deadlines from their original assignment dates; completed courses retain their deadlines/completion. The review lists current and proposed dates, with search and pagination. Changes to people, settings, assignments or progress invalidate the review. Shorter windows can make work overdue immediately; longer onboarding windows can return someone to New user. Turning due dates off hides deadlines and overdue flags without changing assignment completion, stored targets or stage. A new course version starts a new catch-up window and requires completion of that version to count toward the percentage. Ordinary content corrections and playlist reordering do not restart windows. Overdue learning stays assigned and accessible after the person becomes Existing.

## Changes and history

Curricula remain linked to teams or groups. Adding a course to a linked curriculum adds that course to each linked audience’s learning list. Removing a course removes that source only; another direct assignment or curriculum can keep it assigned. Reordering or changing assignment sources within the same audience preserves a continuously active assignment's date. Existing valid course completions remain valid.

Leaving a linked team removes that membership source. Individual membership or another matching team link keeps membership active. Removing the final course-assignment source ends its episode. Rejoining starts a new episode and deadline while retaining same-version completion history. Deleting a group removes its assignment links and Update tags while preserving all course content and progress. Other groups are independent and stay in place. Curriculum deletion removes its links from teams and groups, preserving individual course records and any other assignment sources.

Reports count each course once per learner. Managers and contributors explicitly assigned as team managers receive team-and-descendant reporting scope. Learning-group membership grants no reporting access. Administrators can mark a person's current course version complete or reset progress with revision checks and an audit record.

The flat upgrade replaces former group inheritance with explicit sources. It preserves stable IDs, current membership and course-version coverage, progress, saved deadlines, Update relevance and guest recommendations. Linked team branches remain live; future changes to a former child group no longer change its former ancestors. Older direct-only team sources remain direct until reviewed expansion.

See [learning groups installation and verification](learning-groups.md) before upgrading. This describes implementation, not proof of any installation's deployment state.

### Curriculum presentation

For you replaces courses contained in an explicitly assigned, published curriculum with a curriculum card. Direct assignments from the person’s team and ancestor teams count alongside group membership and linked team branches. Standalone assigned courses remain visible; assigning the same curriculum through multiple teams or groups does not duplicate its card. Overlapping curricula may both appear, but their shared courses still count only once in the overall assigned completion summary. Draft or unassigned curricula never suppress assigned course cards.

The home queue hides complete cards; the full Assigned browser includes them unless Hide completed is selected. In progress and Completed remain course-level views across assigned and self-directed learning. Category filtering matches a curriculum when one of its courses belongs to that category; searching also matches its course titles. Curricula outside assignments are accessible through Browse curricula.

A curriculum opens at `/curricula/<id>` in the server application or `/#curricula/<id>` in the demo. The page shows its title, description and shared course cards in saved order. Its back link returns to the validated page that launched it, or Courses for direct entry. Course cards open the player directly and retain curriculum context for Back and Close course. Sequence is recommended, not a prerequisite lock; completed courses remain available for review. The underlying assignment and authorization rules are unchanged.

Administrators can assign a published course from Content or its editor, and a published curriculum from Curricula. The shared audience picker labels both **Team: Name** and **Group: Name**, retains selections while searching and separates bulk Add from Remove. Reports show every matching team/group and direct/curriculum path. Removing one source never removes another continuously active source.
