# Guest recommendations

Public installations can optionally recommend published Updates and Courses to signed-out visitors. Groups guide **For you**; they never restrict the published library. No account, membership or reporting entry is created for a guest.

## Configure recommendations

In **Organization Settings → Access**, choose public browsing. **Guest recommendations** appears directly below that setting.

- Select an existing learning group, then **Save settings**. A group already used by members is valid; Fieldbook does not require or create an “All organization” group.
- Or select **Create guest group**, name it and choose **Create group**. This explicitly saves an empty learning group and selects it in the form. Choose **Save settings** to apply the selection. Leaving without saving keeps the new group but leaves the previous guest selection unchanged.
- In **Learning groups**, add courses/curricula and relevant Updates to that group. An empty group provides no recommendations until it or its parents have learning or Update targets.
- Choose **None — no personalized recommendations.** to remove the selection. Public browsing remains available, with quiet empty states in For you.

The normal group rules apply: direct membership in the selected group includes its ancestors, with parent foundations first. Child or sibling groups are not included. Reporting-team links do not enroll guests in anything. Published curricula expand to courses; overlapping assignments count each course once and optional learning does not reduce assigned completion.

Deleting the selected group safely removes guest recommendations. The Access settings page retains an “Unavailable group” option and asks for another selection or None. Turning access private retains the selection for a later return to public access; anonymous requests are denied and neither the selection nor its recommendations are exposed before sign-in.

## Progress and sign-in

Guest progress stays in that browser. Guests have no onboarding dates, deadlines or overdue status. Completing a course changes local completion, not employee counts, membership counts or reports.

Signing in switches recommendations to the account's actual groups. It never adds the guest group or merges its assignments into the account. The existing progress-import offer is unchanged: **Save browser progress to my account** explicitly submits locally recorded lessons and retained quiz answers; the server checks the current published course/version and re-grades answers. Each successfully imported record is removed locally. A partial failure leaves remaining browser records available. **Not now** dismisses the offer without importing. This transfers learning evidence, not assignments or membership.

The demo profile picker offers the named sample profiles. Public installations can still serve signed-out visitors and offer the browser progress-import flow described below.

## Upgrade and operation

No new migration, environment variable or service is required. `guestGroupId` is an optional value in the existing settings JSON. Missing or null means no guest recommendations, so older public installations remain usable immediately after upgrading. Deployment alone does not select or create a group.

Recommendation resolution happens inside the existing uncached workspace read, after the public/private check. The response includes the public library and a synthetic recommendation group with the minimum sequence/curriculum data needed by the shared UI. It omits real group identities, team links, membership rosters, assignment timestamps, governance revisions, drafts and answer keys. Administrator settings writes retain authorization and revision checks and also reject a changed group configuration during saving.

Group, curriculum and publication changes appear on the next workspace load/reload. Already-open workspaces retain the same loaded-snapshot behavior as signed-in learning; this feature adds no live subscription. Unpublished or deleted content is excluded from subsequent reads. Existing private media link expiry still applies; see [installation security](installation.md#implemented-boundaries-and-remaining-verification).

## Verification

Run `pnpm test`, both builds, `pnpm check:ui`, `pnpm test:ui` and `pnpm test:guests`. For browser tests, build production with `NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-test-key`; never use real credentials. The guest suite runs demo and production UI on ports 3157/3158 (overridable using the standard test port variables), with synthetic HTTP fixtures, desktop/phone screenshots and keyboard checks. The server tests exercise actual snapshot, progress and settings code with a simulated PostgREST transport, including private denial and authorization. Existing SQL learning tests cover assignment and reporting semantics.

These local checks do not verify hosted Google sign-in, Supabase transactions/PostgREST, concurrent operators or cross-device account import. Verify those on an isolated installation before relying on the feature in a live deployment.
