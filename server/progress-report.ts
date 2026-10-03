import "server-only";
import { data as dataStore } from "./data";
import { HttpError } from "./errors";
import type { User } from "@/lib/types";
import type { Workspace } from "@/lib/store";
import type { ProgressPerson, ProgressDetail } from "@/lib/progress-report";
import type { SiteSettings } from "@/lib/settings";

export type ProgressReportRecord = {
  asOf: string;
  revision: number;
  people: ProgressPerson[];
  teams: NonNullable<Workspace["teams"]>;
  groups: Workspace["groups"];
  settings: SiteSettings;
  detail: ProgressDetail | null;
};
function requireReporting(user: User) {
  if (
    !user.active ||
    user.registered === false ||
    !["admin", "manager", "contributor"].includes(user.role)
  )
    throw new HttpError(
      403,
      "Manager or administrator reporting access is required.",
    );
}
export async function progressReport(user: User): Promise<Workspace> {
  requireReporting(user);
  // Provider checks the actor's current role and explicit managed branches again.
  const report = await dataStore().readProgressReport(user.id);
  return {
    schema: 1,
    settings: report.settings,
    governanceRevision: report.revision,
    content: [],
    publishedContent: [],
    users: [user],
    groups: report.groups,
    teams: report.teams,
    progress: {},
    progressReport: { asOf: report.asOf, people: report.people },
  };
}
export async function progressDetail(
  user: User,
  personId: string,
): Promise<ProgressDetail> {
  requireReporting(user);
  const report = await dataStore().readProgressReport(user.id, personId);
  if (!report.detail)
    throw new HttpError(404, "This person's assignments are unavailable.");
  return {
    ...report.detail,
    asOf: report.asOf,
    deadlinesEnabled: report.settings.dueDatesEnabled !== false,
  };
}
