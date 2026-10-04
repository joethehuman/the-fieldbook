# Import people and teams from CSV

Administrators can open **Manage organization → People → Import CSV**. Download the blank template from the instructions, fill it in using an ordinary spreadsheet, and export UTF-8 CSV. The interactive demo offers the same review under Demo profiles and uses browser-local sample data. Do not upload private information to the demo.

Choose **Choose CSV file** to open the system file chooser. The button acknowledges opening immediately; the browser and operating system control when the chooser appears. Selecting a file or cancelling restores the button. The selected filename appears next to it; choose it again to replace the file.

Choose **Import** after reviewing the complete proposal. The changes are saved together, then People refreshes. Imported people have stable roster entries before their first verified Google sign-in; no Auth-provider account or invitation email is created. Learning groups are not created or enrolled by CSV.

## The template

Use one row per user. The six headers can appear in any order. Keep every header, even when an optional column is empty.

| Column | What to enter |
|---|---|
| Name | The user's display name. Required for a new user; blank preserves an existing name. |
| Email | The user's email. It identifies an existing roster record, including a person who has not signed in. |
| Hire date | Optional calendar date in `YYYY-MM-DD` form. It starts the new-user window. |
| Team | The user's direct reporting team, using its unique name. |
| Parent team | That team's immediate parent, using its unique name. Do not enter a hierarchy path. |
| Team manager email | The manager of that team. It must identify an eligible user already in Fieldbook or in this file. |

A team-only row leaves Name, Email and Hire date blank. Use it to define an empty team or a parent that has no direct members. Parents and managers can appear later in the file. Repeated team names describe the same team: nonblank parent and manager values must agree; blank repeated cells do not undo another row's values.

For example, a person in Enterprise US lists `Enterprise US` in Team and `Sales US` in Parent team. A separate team-only row can place `Sales US` under `Organization`.

Each file can contain **2,000 rows, excluding the header, and be at most 2 MB**. Team-only rows count toward the row limit. This bounds a single review and atomic save; it is not an organization-size limit. A 1,050-person organization can use one file if its people and team-only rows together fit. For larger imports, save parent teams and managers first, then import the remaining people, so references exist in Fieldbook or the current file. CSV review never treats omitted people as deletions.

Export the spreadsheet as CSV UTF-8, a text format that preserves accented names and other languages. Quoted commas, quoted line breaks, UTF-8 BOM, and common line endings are accepted. Excel workbooks are not accepted; export them as CSV.

## Existing records and blanks

People match by exact email after trimming and case normalization. Teams match by their unique names after the same normalization. Matches keep their stable Fieldbook IDs. This is not an email-change, team-rename, or identity-merge workflow.

- Blank optional cells preserve existing values. People and teams absent from the file remain untouched.
- A new user with no Team belongs to Organization. A new team with no Parent team sits directly under Organization.
- Explicit `Organization` moves an existing person or team to that root. The CSV cannot change Organization's parent or manager; use its management page.
- A new user without Hire date is an Existing user, with a review notice. Import day and first sign-in never substitute for hire date.
- Hire-date corrections show the proposed user type and new-user window. Existing saved course deadlines and completion stay fixed; changing those requires the separate deadline recalculation workflow.
- Manager assignments show any required manager-role change. Administrator and contributor permissions are preserved. The CSV cannot grant administrator access, reactivate an ordinary inactive user, or delete omitted records. Exact-email matches in Recently deleted show a non-blocking restoration notice: Import restores the same user ID, reactivates the user and removes it from Recently deleted. Course history, original roster-added time and saved deadlines remain; former privileged roles, direct groups and manager assignments are not restored automatically. A manager named explicitly in the CSV can receive manager access again. Permanent purge, expired recovery windows and unfinished account deactivation still block restoration.

To clear an existing manager or hire date, or rename a team, use the ordinary management controls. Blank CSV cells intentionally do not mean deletion.

## Reviewing hundreds of rows

The noninteractive badges summarize new, changed and unchanged people and teams across the whole proposal. People, Teams and Issues select the record type; use Filters to narrow the change type. Each section has search and 25-row pages. People and Teams offer both Name sort directions; Issues remain in CSV row order without a sort picker. People also includes existing members affected by a team change elsewhere in the file.

The compact Users table separates user name, email, team and state. The Teams table shows team name, parent and manager. Expand Details for the complete proposed record, including hire date, hierarchy, manager, access and new-user window. Values identify whether they came from CSV, stayed unchanged or were calculated; changed values also show the current value. Learning and reporting consequences remain in the same detail panel. A team change summarizes affected people together, with its own pages, rather than asking for hundreds of separate approvals. Courses retained through overlapping assignment sources are counted once. Continuous requirements keep their existing deadlines and progress.

Issues retain every source row and column reference. Row 5 means spreadsheet row 5, counting the header as row 1; it is not a count of imported people. Filter by issue type or download the complete issue report, correct the source spreadsheet, and upload again. Conflicting definitions, duplicate identities, missing references, invalid dates, hierarchy cycles, and inactive identities and unrecoverable deleted identities block consequence calculation for the whole proposal. Notices alone do not block it. Back preserves the current review; choosing a replacement file clears it. Cancel closes an unsubmitted review without saving. The Import action commits the whole valid file, not only the current filtered page.

The installed app computes the review from current server-owned records and requires administrator access. It accepts CSV text, not client-selected IDs or proposed totals. Review files are transient and are not stored as uploaded artifacts. The additive `20261003140729_roster_csv_import.sql` migration creates a service-only receipt table and review/apply functions. Apply it before deploying dependent code; existing roster, assignments and progress are preserved by the migration.

## Saving and recovery

Apply `20261003222648_roster_import_reactivation.sql` before deploying CSV restoration support. It replaces only the service-only import functions, preserves existing data and checks recovery state again inside the atomic save. Existing signed-in users have their provider login ban cleared while their deleted profile still denies application access; a failed unlock saves no import and can be retried.

Import revalidates the file against server-owned records. Every changed row, new team, manager role and assignment-source update is committed in one database transaction. Blocking issues prevent the entire import. Existing identities, roles, continuous course deadlines and progress are preserved; new requirements follow the existing assignment rules.

If roster, configuration, published learning or the review date changes, review the file again. A lost response does not mean failure: Retry Import checks the same operation and returns its saved receipt without creating duplicate people. Back cannot replace an operation while its save is unconfirmed. If the save succeeds but refreshing People fails, Reload People retries only that refresh.

Receipts retain a file hash, actor reference, baseline hash and compact result counts; uploaded CSV files and proposed rosters are not retained. Abandoned reviews expire after a day. Committed receipts remain available for retry and accountability. Person deletion clears the receipt’s actor reference; receipts do not retain names or emails. Browser-local demo imports use the same validator and commit to local storage with a stale-data check.

## Future roster connections

The CSV parser translates rows into a shared roster input: people, teams, immediate parents, manager references, and optional hire dates. Matching and consequence calculations are separate from CSV parsing and UI components. An optional external reference has a connection identifier, resource kind (`person` or `team`) and external ID.

This is a foundation for future adapters, not an HRIS or directory integration. No provider mapping table, SCIM endpoint, credentials, synchronization job, field ownership rule, or email-change reconciliation is implemented. SSO authentication remains separate from roster provisioning.

This implementation was written with AI assistance. Its validation evidence includes synthetic 500-person/100-course reviews, permission and input-boundary tests, and browser checks; it does not substitute for an installation’s hosted sign-in and import acceptance.

## Recently added people

People and Demo profiles offer **Added (newest)** and **Added (oldest)** sorting. It uses the time a roster entry was saved, independently of hire date and first sign-in. Imports, individual pre-registration and new verified sign-ups capture it; editing, CSV updates and later sign-in preserve it. People created before this capture was introduced have unknown dates and follow dated entries, ordered by name. No historical dates are invented.

Apply `20261003162418_roster_added_at.sql` before deploying this refinement. It adds a nullable roster timestamp and a private trigger that assigns it on insertion and preserves it on updates. Existing application data, functions, access policies and learning clocks remain unchanged.
