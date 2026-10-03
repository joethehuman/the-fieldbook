# Review a people and team CSV

Administrators can open **Manage organization → People → Import CSV**. Download the stored blank template or fictional example, fill it in using an ordinary spreadsheet, and export UTF-8 CSV. The interactive demo offers the same review under Demo profiles and uses browser-local sample data. Do not upload private information to the demo.

**This workflow currently reviews files only. Close review saves nothing.** It does not create accounts, send invitations, change assignments, or import learning groups. A validated review is a proposed change, not a completed import.

## The template

Use one row per person. The six headers can appear in any order. Keep every header, even when an optional column is empty.

| Column | What to enter |
|---|---|
| Name | The person's display name. Required for a new person; blank preserves an existing name. |
| Email | The person's email. It identifies an existing roster record, including a person who has not signed in. |
| Hire date | Optional calendar date in `YYYY-MM-DD` form. It starts the new-user window. |
| Team | The person's direct reporting team, using its unique name. |
| Parent team | That team's immediate parent, using its unique name. Do not enter a hierarchy path. |
| Team manager email | The manager of that team. It must identify an eligible person already in Fieldbook or in this file. |

A team-only row leaves Name, Email and Hire date blank. Use it to define an empty team or a parent that has no direct members. Parents and managers can appear later in the file. Repeated team names describe the same team: nonblank parent and manager values must agree; blank repeated cells do not undo another row's values.

For example, a person in Enterprise US lists `Enterprise US` in Team and `Sales US` in Parent team. A separate team-only row can place `Sales US` under `Organization`. The downloaded example illustrates this without requiring a full path on every row.

The initial bounds are **1,000 data rows and 2 MB**. Quoted commas, quoted line breaks, UTF-8 BOM, and common line endings are accepted. Excel workbooks are not accepted; export them as CSV.

## Existing records and blanks

People match by exact email after trimming and case normalization. Teams match by their unique names after the same normalization. Matches keep their stable Fieldbook IDs. This is not an email-change, team-rename, or identity-merge workflow.

- Blank optional cells preserve existing values. People and teams absent from the file remain untouched.
- A new person with no Team belongs to Organization. A new team with no Parent team sits directly under Organization.
- Explicit `Organization` moves an existing person or team to that root. The CSV cannot change Organization's parent or manager; use its management page.
- A new person without Hire date is an Existing user, with a review notice. Import day and first sign-in never substitute for hire date.
- Hire-date corrections show the proposed user type and new-user window. Existing saved course deadlines and completion stay fixed; changing those requires the separate deadline recalculation workflow.
- Manager assignments show any required manager-role change. Administrator and contributor permissions are preserved. The CSV cannot grant administrator access, reactivate inactive or deleted people, or delete omitted records.

To clear an existing manager or hire date, or rename a team, use the ordinary management controls. Blank CSV cells intentionally do not mean deletion.

## Reviewing hundreds of rows

The whole-file counts summarize new, changed and unchanged people and teams. People, Teams and Issues have search, filters, sorting and 25-row pages; counts always cover the entire proposal. People also includes existing members affected by a team change elsewhere in the file.

Expand a row for before/after values and learning or reporting consequences. A team change summarizes affected people together, with its own pages, rather than asking for hundreds of separate approvals. Courses retained through overlapping assignment sources are counted once. Continuous requirements keep their existing deadlines and progress.

Issues retain every row and column reference. Filter by issue type or download the complete issue report, correct the source spreadsheet, and upload again. Conflicting definitions, duplicate identities, missing references, invalid dates, hierarchy cycles, and inactive or deleted identities block consequence calculation for the whole proposal. Notices alone do not block it. Back preserves the current review; choosing a replacement file clears it. Cancel or Close review makes no changes.

The installed app computes the review from current server-owned records and requires administrator access. It accepts CSV text, not client-selected IDs or proposed totals. Review files are transient and are not stored as uploaded artifacts. The review uses existing database reads and needs no new migration.

## Future roster connections

The CSV parser translates rows into a shared roster input: people, teams, immediate parents, manager references, and optional hire dates. Matching and consequence calculations are separate from CSV parsing and UI components. An optional external reference has a connection identifier, resource kind (`person` or `team`) and external ID.

This is a foundation for future adapters, not an HRIS or directory integration. No provider mapping table, SCIM endpoint, credentials, synchronization job, field ownership rule, or email-change reconciliation is implemented. SSO authentication remains separate from roster provisioning.

This implementation was written with AI assistance. Its validation evidence includes synthetic 500-person/100-course reviews, permission and input-boundary tests, and browser checks; it does not establish hosted import or transaction behavior, because saving is not yet part of this workflow.
