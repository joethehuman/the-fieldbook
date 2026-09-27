# Bulk actions and recently deleted items

Administrators select rows where they already work. Content and People tables select the visible page; the action below the table explicitly selects all matching results. Changing a filter or administration section clears selection. Operations show counts and reasons for unsuccessful items. Refresh and review after an uncertain response before retrying.

Bulk selection controls appear only when the matching list has at least two items, counting across all pages. Empty and single-item lists retain Add/create and individual actions.

All commands affecting selected rows live in one **Bulk actions** menu. Delete is separated at the bottom. To add relationships that are not listed yet, use the screen’s **Add** picker: search, select a page or all matches, review selected items, and Apply. Cancel saves nothing. The [design-system contract](design-system.md#bulk-actions-two-supported-methods) defines these two reusable methods.

- **Content:** publish saved drafts, unpublish, delete, or choose an existing category for Updates/Courses. Category changes require one content type; they cannot create categories. Docs use **Move to section**, including top-level sections and subsections. Metadata changes update both copies without publishing other draft edits, changing course versions, or resetting learning dates. Published Updates/Courses can be added to or removed from learning groups; Courses can be added to curricula. Bulk publication uses the usual validation and advances publication dates for Updates.
- **People:** add/remove direct learning-group membership, set/remove a reporting team, activate/deactivate, set onboarding dates, or delete accounts. Each person has one direct reporting team. Moving people changes manager reporting and team-linked assignments; saved learning history remains. Deactivation preserves the account and does not start a deletion timer. The current administrator and installation owner must remain active.
- **Pending accounts:** set direct groups, reporting team or onboarding date, or revoke selected preregistrations. No invitation emails are sent. Revocation removes preregistration, not an existing account. Saves stop at the first unconfirmed write and report confirmed changes.
- **Learning groups:** select groups to add/remove learning items or Update audiences. Within a group, select direct people, linked teams, learning items or Updates to remove those links. Inherited membership is labeled separately. Removing a direct link does not remove membership inherited from a team or child group.
- **Teams:** select direct roster members to remove or move them; Add members uses the common picker and identifies their existing direct team. Select teams in the overview to change learning-group links. Managers and the reporting hierarchy are not changed by these actions.
- **Curricula:** select curricula to publish/unpublish or change learning-group links. A published curriculum needs published courses; remove its group links before unpublishing it. While editing a curriculum, add courses with the picker or select sequence rows to remove links, then Save to apply the sequence.
- **Recently deleted:** search, sort and select recoverable content/accounts for Restore.
- **AI connections:** select connections to revoke their access for the current administrator. This is immediate revocation, without a recovery window.

Groups guide relevance and assignments, never access to published content.

## Deletion and recovery

Deleting content immediately unpublishes it. Deleting an account immediately makes its profile inactive and disables its MCP grants. API and reader requests check the fresh profile, including for previously issued access tokens. The account is also banned in Auth. If that provider call fails, access remains denied and the scheduled worker retries the Auth lock. Restoration waits for that lock to finish to avoid racing account deactivation. The installation owner, current administrator and last active administrator are protected; managed teams must be reassigned first.

The explicit confirmation describes permanent erasure and requires acknowledgment. **Administration → Organization Settings → Recently deleted** lists the deletion time, administrator and permanent-deletion deadline. Restore is available until 30 full days have elapsed, using the database clock. Repeating Delete does not reset that deadline.

Restored content is a draft. Restored users are inactive learners with no direct groups or team; review and explicitly reactivate them in People. Restoration preserves their course history during the recovery window, without restoring elevated privileges or overwriting current team/group settings.

After the deadline, the cleanup worker erases the content/account and associated learning history, attempts, feedback and retained application audit snapshots containing those records. Organization-authored content survives a user's deletion; their audit attribution is removed. Media still referenced by surviving drafts, published content, recovery snapshots, settings or audit snapshots is preserved. Unreferenced media associated with a purged record is removed through the Storage API. Empty curricula become drafts and their group assignments are removed.

Permanent deletion is irreversible in the application. Provider backups have separate retention; this feature does not promise immediate erasure from backups. After restoring a database backup, reconcile deletion deadlines and any Auth/Storage operations completed after that backup before reopening access.

The demo simulates recovery in browser storage. Its expiry cleanup runs when the demo is opened or a bulk action is applied; it is not a background service.

## Install or upgrade the cleanup worker

On a fresh installation, apply **every** migration from the checked-out release in filename order, including these final five files. On an existing installation, back up the database and Storage separately, rehearse the upgrade in an isolated backend, then apply only the migrations not already recorded. Apply these five in this order **before** deploying the matching server code:

1. `supabase/migrations/20260927150657_bulk_actions_recovery.sql`
2. `supabase/migrations/20260927151228_deletion_schedule.sql`
3. `supabase/migrations/20260927151533_bulk_recovery_references.sql`
4. `supabase/migrations/20260927152156_account_deletion_lock.sql`
5. `supabase/migrations/20260927153217_media_cleanup_lock.sql`

The migrations preserve existing records, add recoverable deletion and media cleanup tables, and install an hourly [Supabase Cron](https://supabase.com/docs/guides/cron) job using `pg_cron` and `pg_net`. The schedule alone does **not** complete setup: its endpoint is initially empty, so it cannot call the worker until you configure it.

After the server application is deployed, use an operator SQL session in **that installation's Supabase project** to set the endpoint. Use the final HTTPS hostname that serves the application directly. Check that it does not redirect to another hostname, because the Authorization header can be lost across a redirect:

```sql
update public.fb_cleanup_config
set endpoint = 'https://YOUR-DIRECT-APP-HOST.example/api/internal/purge-deleted'
where id = true;
```

A private database-generated credential authenticates the job. It is held in the service-only cleanup configuration and sent in the Authorization header. Do not copy, display, log, or commit it. Keep preview and production endpoints pointed at their respective applications and databases. The endpoint must be reachable by Supabase; deployment protection or a firewall must permit this worker request. Do not point a preview database at production.

The job runs at minute 17 each hour. No item is purged before its deadline; successful cleanup normally occurs within the following hour. Batches are bounded and durable claims prevent restoration once permanent deletion starts. Failed or interrupted claims retry after at least 15 minutes on a subsequent scheduled run. Storage failures retain their cleanup queue entries. Large backlogs may need more runs.

For a **fresh, empty installation**, you can send the exact request used by the scheduled job from the same operator SQL session. Keep the returned `request_id`; do not substitute a hard-coded number when checking the response. This request can process due deletions on an existing installation, so review its queue before using it during an upgrade.

```sql
select net.http_post(
  url := endpoint,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || secret
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id
from public.fb_cleanup_config
where id = true and endpoint is not null;
```

The HTTP request starts after the SQL transaction commits. Check that its response appears and is HTTP 200, then confirm that `last_run` advanced. An empty installation should return `{"removed":0,"failed":0}`. A successful SQL job only means the HTTP request was queued; it does not prove the app accepted it. Check the active schedule and the first **timed** invocation as well:

```sql
select endpoint, last_run from public.fb_cleanup_config where id = true;
select id, status_code, content, error_msg
from net._http_response where id = YOUR_REQUEST_ID;
select jobname, schedule, active
from cron.job where jobname = 'fieldbook-purge-deleted';
select entity, id, purge_after, purging, error
from public.fb_deleted_items order by purge_after;
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'fieldbook-purge-deleted')
order by start_time desc limit 10;
```

Replace `YOUR_REQUEST_ID` with the numeric ID returned by the manual request; do not paste the credential into a query. `pg_net` responses are retained only temporarily, so inspect them promptly. If the response is 401, confirm that the endpoint is the direct, nonredirecting app hostname and that the request reached the intended installation. If it is missing, check network reachability and deployment protection. Recently deleted warns when the endpoint is unconfigured or the worker has not checked in for over two hours. A delayed item remains inactive; errors do not reset its deadline or expose it to learners.

Auth and Storage deletion use supported Supabase APIs. If an imported account owns Storage objects outside Fieldbook's service-created bucket objects, ownership can block Auth deletion. Resolve those ownership references through supported provider tools and let the job retry; do not delete shared media or manipulate Auth/Storage system tables directly.
