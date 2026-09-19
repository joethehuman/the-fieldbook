# Learning model

These assignment and team rules currently describe the interactive demo. Production team/group administration is not enabled.


- Users may join multiple groups. Membership includes ancestors; parent assignments apply to nested group members.
- Each course appears once even when multiple group assignments apply.
- Each group assignment supports no deadline, a calendar date, or a positive number of days after assignment.
- Relative deadlines start at the later of assignment creation and the user's recorded group join date. When multiple memberships qualify, the earliest qualifying membership applies. Calendar calculations use UTC dates.
- Overlapping deadlines resolve to the earliest deadline. No-deadline assignments do not cancel another deadline.
- Legacy demo records lack historical assignment/membership timestamps: the original content timestamp is used as the baseline. Moving a group under a parent immediately inherits that parent's existing assignment rules. Production will materialize assignment events rather than infer historical enrollment.
- Currentness counts all currently published assigned courses, including ones due later. Publishing a new course version requires fresh completion.
- Reviewing/retaking does not erase a previous pass. Attempts are recorded against a course version; failed retakes preserve completion.
- The demo records one reporting team per user, with a manager on each team. A manager can oversee multiple teams. Cyclic hierarchy choices are prevented.

