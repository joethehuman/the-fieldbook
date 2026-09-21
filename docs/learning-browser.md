# Learning browser and curriculum navigation

The Courses home keeps an assigned-only completion summary and an unfinished queue. An assigned curriculum appears as one card in place of its constituent courses. Standalone assignments remain cards. The summary counts distinct courses, even when curricula overlap. Completed curricula disappear from the home queue and remain available in the full For you view.

The full browser has For you, In progress, Completed and All courses views. For you includes all assigned cards by default, with Hide completed beside the result count. In progress and Completed include optional courses. Search, one Channel dropdown and Sort share a labeled toolbar. Home uses channel headings without repeating channel filter buttons. Browse curricula opens the published curriculum collection.

Curriculum cards open a simple page with description, completion, next-course action and an ordered launch list. All available published courses remain accessible, including completed ones. The next action chooses the first incomplete course. Course pages return to the curriculum, including after reload. Direct curriculum URLs work in demo and server routing.

Current-version progress drives every indicator. Opening a course alone does not start it; valid lesson or quiz activity does. Course rings include the knowledge check; curriculum rings count completed courses. Empty curricula do not earn completion checks.

## Shared patterns

LearningCard and CardGrid own card anatomy, spacing and sizing. CourseRow owns its section heading, optional leading summary, overflow measurement and header-slot controls. BrowseToolbar aligns labeled collection controls. LaunchList owns the simple ordered learner list. These compose existing ContentAction, CardFooter, ProgressStatus, Field, SelectField and semantic tokens. The `/ui` catalog and design-system standards document their contracts. Superseded offsets and feature-local layout rules were removed.
