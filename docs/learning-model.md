# Learning model

Everyone with access to an installation can explore its full published library. Learning groups personalize Courses and Updates; they never control content visibility. Drafts retain their editorial protections. Organization access settings still determine whether sign-in is needed to enter an installation.

## Groups, channels and curricula

- A learning group answers “who is this for?” People can belong to several groups, individually or through linked teams. Parent-group membership is inherited. Team links follow direct team membership automatically; select child teams separately. Teams continue to govern manager reporting independently.
- A channel organizes courses in the library. Each course has one channel. It does not determine assignments.
- A curriculum is a named, ordered playlist of courses. Published curricula can be browsed by everyone and added to learning groups. Draft curricula are only available to administrators. Curricula are maintained in their own admin tab.
- A learning group's sequence can contain both courses and curricula. Parent groups come first, then groups at the same depth sort by name. Within a group, follow its saved item order and each curriculum's course order. A course encountered more than once appears once in the combined recommendation. Courses are never locked.

## For you and completion

The Courses page starts with For you for signed-in users, then offers published curricula and the full course library. For you shows outstanding assigned courses and a completion card. The card reports completed designated courses divided by all currently published designated courses. A valid completion counts regardless of where the learner originally took the course. A percentage is never rounded to 100 while a course remains unfinished. People with no designated learning see “No assigned courses yet,” without an earned completion percentage.

### Browsing courses and personal activity

“View all for you” opens the shared course browser with **For you** selected. It contains every assigned published course, grouped by channel, including completed courses. **Hide completed** defaults off and filters only this view. The home For you row always shows unfinished assigned courses in recommended order; its Start/Continue action opens the next course in that same order.

The browser also provides **In progress** (any started, unfinished course), **Completed** (all current-version completions, assigned or optional), and **All courses** (the published course library). Switching views clears search/channel filters and resets Hide completed. Search and sorting apply within the selected collection. These views use the same saved progress; they do not enroll learners or change assignments.

Activity means a valid completed lesson, a recorded quiz attempt, or a passing quiz on the current course version. Merely opening a course or having an empty progress record does not make it in progress. Course-card rings count completed lessons plus the passing knowledge check as one final step; only a valid completion earns a check mark. Curriculum indicators count completed published courses in their playlist. Empty curricula do not show earned completion.

Optional activity never changes the assigned completion percentage. Someone who has completed all five assigned courses and started an optional sixth stays 100% complete, with the sixth course available in In progress. Completed assigned courses remain available in the full For you view and Completed.

Course-row arrows appear only when the row overflows and are disabled at each unavailable endpoint. Resizing and course-list changes recalculate their state. Compact progress indicators are shared UI primitives, with text status as well as color.

The Updates page starts with matching group updates, newest updated first, followed by other updates in the same date order. Each update appears once. Updates do not affect course completion or create deadlines. Adding an audience tag does not change an update's editorial date. Users without matching groups still see all published updates. Guest users see the full unpersonalized library.

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
