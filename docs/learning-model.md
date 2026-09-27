# Learning model

Everyone with access to an installation can explore its full published library. Learning groups personalize Courses and Updates; they never control content visibility. Drafts retain their editorial protections. Organization access settings still determine whether sign-in is needed to enter an installation.

## Groups, categories and curricula

- A learning group answers “who is this for?” People can belong to several groups, individually or through linked teams. Parent-group membership is inherited. Team links follow direct team membership automatically; select child teams separately. Teams continue to govern manager reporting independently.
- A category organizes courses in the library. Each course has one category. It does not determine assignments.
- A curriculum is a named, ordered playlist of courses. Published curricula can be browsed by everyone and added to learning groups. Draft curricula are only available to administrators. Curricula are maintained in their own admin tab.
- A learning group's sequence can contain both courses and curricula. Parent groups come first, then groups at the same depth sort by name. Within a group, follow its saved item order and each curriculum's course order. A course encountered more than once appears once in the combined recommendation. Courses are never locked.

## For you and completion

The Courses page starts with For you for signed-in users, then offers published curricula and the full course library. The home For you queue shows outstanding assigned courses or curriculum cards and a completion summary. The card reports completed designated courses divided by all currently published designated courses. A valid completion counts regardless of where the learner originally took the course. A percentage is never rounded to 100 while a course remains unfinished. People with no assigned learning see no completion ring; the card shows any in-progress or completed courses and links to Your courses when there is activity.

### Browsing courses and personal activity

“View all for you” opens the shared course browser with **Assigned** selected for signed-in learners, or **For you** for guests. It contains assigned published courses and curriculum cards, including completed cards; the curriculum presentation rules below describe how these are combined. Guest-group items remain recommendations and do not gain an Assigned card label. **Hide completed** defaults off and filters only this view. The home For you row shows unfinished assigned cards in recommended order; a curriculum card opens its ordered course list.

The browser also provides **Your courses** (assigned courses plus any other course started or completed on its current version), **In progress** (any started, unfinished course), **Completed** (all current-version completions), and **All courses** (the published course library). An Assigned marker appears quietly on assigned course cards in browser views; other cards have no assignment label. Switching views clears search/category filters and resets Hide completed. Search and sorting apply within the selected collection. These views use the same saved progress; they do not enroll learners or change assignments.

Activity means a valid completed lesson or recorded quiz attempt on the current course version. Merely opening a course or having an empty progress record does not make it in progress. Course-card rings count completed lessons and final course completion as one last step. The last lesson completes a course without a quiz; the final quiz submission completes a course when its rule allows it. The finish screen then offers optional feedback and Close course. A quiz is eligible after any full submission unless Require all answers correct to complete is on, in which case a fully correct attempt is required. Older published quizzes retain their prior all-correct rule. Each new attempt stores selected stable option IDs, per-question correctness, overall correctness, version and time. Legacy summary-only attempts and earned completions remain valid without invented answer details. Curriculum indicators count completed published courses in their playlist. Empty curricula do not show earned completion.

Self-directed activity never changes the assigned completion percentage. Someone who has completed all five assigned courses and started another stays 100% complete, with that course available in Your courses and In progress. Completed assigned courses remain available in the Assigned and Completed views.

Course-row arrows appear only when the row overflows and are disabled at each unavailable endpoint. Resizing and course-list changes recalculate their state. Compact progress indicators are shared UI primitives, with text status as well as color.

The Updates page shows up to two recent published updates for the viewer's effective groups, including inherited groups and the configured guest group. Below that, the full published Updates library continues in the same order, excluding only the updates already featured; older relevant updates remain in the library. The library reveals ten more items at a time, without fetching another page because the catalog is already loaded. An update appears at most once. Updates have no completion requirement and do not affect course completion or deadlines. Users without matching groups see the full library without a For you section.

The current content model does not store a first-publication timestamp. Ordering therefore uses the timestamp on the published snapshot (`updatedAt`), falling back to a valid creation timestamp and then a stable ID order for undated items. Draft-only edits do not change the published snapshot or move an update. Republishing an edited update does change its published timestamp and can move it higher in the feed. A separate first-publication date would require a future data-model change.

Docs are organized by their navigation, without learning-group targeting.

Fieldbook does not enforce completion, grant rewards, lock prerequisites, or trigger consequences. Recognition and organizational practices around the percentage are managed outside the platform.

## Completion windows

Organization settings supply an onboarding window (90 days by default) and a catch-up window (30 days by default). An onboarding start date identifies a new user's window; an existing user has none. Windows provide timing context, not access restrictions or expiration of assignments.

An assignment starts at the later of its group assignment date and the person's effective membership date. Use the earliest continuing assignment when multiple group sources apply. The target is the later of assignment start plus catch-up days and onboarding start plus onboarding days. Dates use UTC. A September 20 assignment gets an October 20 target with a 30-day catch-up window; a later November 30 onboarding target takes precedence.

Changing the organization windows recalculates targets. A new course version starts a new catch-up window and requires completion of that version to count toward the percentage. Ordinary content corrections and playlist reordering do not restart windows. Overdue learning stays assigned and accessible.

## Changes and history

Curricula remain linked to groups. Adding a course to a linked curriculum adds that course to the group's learning list. Removing a course removes that source only; another direct assignment or curriculum can keep it assigned. Reordering or changing assignment sources within the same group preserves a continuously active assignment's date. Existing valid course completions remain valid.

Leaving a linked team removes that membership source. Individual membership or another inherited source keeps membership active. Removing the final membership source and later rejoining starts a new membership window. Deleting a group removes its links and tags, moves child groups to its parent, and preserves all course content and progress. Curriculum deletion removes its links from groups, preserving individual course records and any other assignment sources.

Reports count each course once per learner. Managers retain their existing team-and-descendant reporting scope. Administrators can mark a person's current course version complete or reset progress with revision checks and an audit record.

See [learning groups installation and verification](learning-groups.md) before upgrading. This describes implementation, not proof of any installation's deployment state.

### Curriculum presentation

For you replaces courses contained in an explicitly assigned, published curriculum with a curriculum card. Inherited group assignments count. Standalone assigned courses remain visible; assigning the same curriculum through multiple groups does not duplicate its card. Overlapping curricula may both appear, but their shared courses still count only once in the overall assigned completion summary. Draft or unassigned curricula never suppress assigned course cards.

The home queue hides complete cards; the full Assigned browser includes them unless Hide completed is selected. In progress and Completed remain course-level views across assigned and self-directed learning. Category filtering matches a curriculum when one of its courses belongs to that category; searching also matches its course titles. Curricula outside assignments are accessible through Browse curricula.

A curriculum opens at `/curricula/<id>` in the server application or `/#curricula/<id>` in the demo. The page shows its title, description and shared course cards in saved order. Its back link returns to the validated page that launched it, or Courses for direct entry. Course cards open the player directly and retain curriculum context for Back and Close course. Sequence is recommended, not a prerequisite lock; completed courses remain available for review. The underlying assignment and authorization rules are unchanged.
