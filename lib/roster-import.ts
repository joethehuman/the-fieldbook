import type { Workspace } from "./store";
import type { Team, User } from "./types";
import { ancestorIds, reportingTeamId } from "./types";
import {
  organizationTeam,
  validateOrganizationTeams,
} from "./organization-team";
import { assignmentImpact, reportingImpact } from "./assignment-episodes";
import { updateMatchesAudience } from "./content-audiences";
import { learningStage, onboardingClockTarget } from "./learning";
import { roleLabel } from "./permissions";
import type { CsvReport } from "./csv";

export const ROSTER_IMPORT_COLUMNS = [
  {
    key: "name",
    label: "Name",
    guidance: "Required for new users; blank keeps an existing name.",
  },
  {
    key: "email",
    label: "Email",
    guidance: "Required for users. Used to match existing records.",
  },
  {
    key: "hireDate",
    label: "Hire date",
    guidance: "Optional YYYY-MM-DD. Starts the new-user learning window.",
  },
  {
    key: "team",
    label: "Team",
    guidance: "The user's direct reporting team. Use its unique name.",
  },
  {
    key: "parent",
    label: "Parent team",
    guidance:
      "The team directly above this team. Use its name, not a full path.",
  },
  {
    key: "manager",
    label: "Team manager email",
    guidance: "This team's manager, already in Fieldbook or in this file.",
  },
] as const;
export const ROSTER_IMPORT_MAX_ROWS = 2_000;
// Below the host's request-body ceiling even after JSON quoting. More than enough
// for 1,000 records with the same field bounds as ordinary roster editing.
export const ROSTER_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
type Column = (typeof ROSTER_IMPORT_COLUMNS)[number]["key"];
export type ImportIssue = {
  row: number;
  column: string;
  code: string;
  message: string;
  severity: "error" | "notice";
  target?: string;
};
/** Scoped IDs are an adapter seam, not extra CSV columns or a connector. */
export type ExternalRosterReference = {
  connection: string;
  resource: "person" | "team";
  externalId: string;
};
export type RosterInput = {
  source: "csv" | { connection: string };
  rows: number;
  people: {
    key: string;
    email: string;
    row: number;
    name?: string;
    hireDate?: string;
    team?: string;
    external?: ExternalRosterReference;
  }[];
  teams: {
    key: string;
    name: string;
    rows: number[];
    parent?: string;
    manager?: string;
    external?: ExternalRosterReference;
  }[];
  issues: ImportIssue[];
};
export type ImportChange = { field: string; before: string; after: string };
export type ImportReviewValue = {
  field: string;
  value: string;
  source: "From CSV" | "Kept" | "From team" | "Calculated" | "Default";
};
export type ImportReviewRow = {
  key: string;
  id?: string;
  name: string;
  secondary: string;
  csvRows: number[];
  status: "new" | "changed" | "unchanged" | "issue";
  changes: ImportChange[];
  /** Display-only projection of the authoritative proposed record. */
  values: ImportReviewValue[];
  notes: string[];
  issues: ImportIssue[];
  affected: string[];
};
export type ImportPersonImpact = {
  id: string;
  name: string;
  email: string;
  coursesAdded: string[];
  coursesRemoved: string[];
  updatesAdded: number;
  updatesRemoved: number;
  reportingAdded: string[];
  reportingRemoved: string[];
};
export type RosterReview = {
  rows: number;
  people: ImportReviewRow[];
  teams: ImportReviewRow[];
  issues: ImportIssue[];
  impact: ImportPersonImpact[];
  courses: { id: string; title: string }[];
  affectedPeople: { id: string; name: string; email: string }[];
  reviewedAt: string;
  governanceRevision?: number;
  valid: boolean;
  /** Opaque reviewed-operation receipt; installed authority lives in the database. */
  token?: string;
};
const normalized = (value: string) => value.trim().toLowerCase();
const personKey = (email: string) => "person:" + normalized(email);
const teamKey = (name: string) => "team:" + normalized(name);
const emailValid = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01") return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Strict quoted CSV records; row numbers count spreadsheet records, not body newlines. */
function csvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const record = () => {
    cell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
      continue;
    }
    if (char === '"') {
      if (field || closed)
        throw new Error(
          "A quote must start a cell. Export the file as CSV again.",
        );
      quoted = true;
    } else if (char === ",") cell();
    else if (char === "\n" || char === "\r") {
      record();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (closed) {
      if (char !== " " && char !== "\t")
        throw new Error(
          "Unexpected text after a quoted cell. Export the file as CSV again.",
        );
    } else field += char;
  }
  if (quoted)
    throw new Error(
      "A quoted cell is unfinished. Export the file as CSV again.",
    );
  if (row.length || field || closed) record();
  return rows;
}

/** CSV translates into ordinary roster input; it never modifies a workspace. */
export function parseRosterCsv(csv: string): RosterInput {
  const input: RosterInput = {
    source: "csv",
    rows: 0,
    people: [],
    teams: [],
    issues: [],
  };
  const issue = (
    row: number,
    column: string,
    code: string,
    message: string,
    target?: string,
  ) =>
    input.issues.push({
      row,
      column,
      code,
      message,
      severity: "error",
      target,
    });
  if (new TextEncoder().encode(csv).byteLength > ROSTER_IMPORT_MAX_BYTES) {
    issue(0, "File", "file-size", "Use a CSV smaller than 2 MB.");
    return input;
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(csv)) {
    issue(
      0,
      "File",
      "file-format",
      "Use a UTF-8 CSV export, not an Excel workbook or binary file.",
    );
    return input;
  }
  let records: string[][];
  try {
    records = csvRecords(csv.replace(/^\uFEFF/, ""));
  } catch (error) {
    issue(0, "File", "csv-format", (error as Error).message);
    return input;
  }
  const header = records.shift()?.map(normalized) || [];
  const expected = ROSTER_IMPORT_COLUMNS.map((column) =>
    normalized(column.label),
  );
  if (
    header.length !== expected.length ||
    new Set(header).size !== header.length ||
    expected.some((label) => !header.includes(label))
  ) {
    issue(
      1,
      "Headers",
      "headers",
      "Use the six template columns. Their order can change, but every heading must appear exactly once.",
    );
    return input;
  }
  input.rows = records.filter((cells) =>
    cells.some((value) => value.trim()),
  ).length;
  if (input.rows > ROSTER_IMPORT_MAX_ROWS) {
    issue(
      0,
      "File",
      "row-limit",
      `Use at most ${ROSTER_IMPORT_MAX_ROWS.toLocaleString("en-US")} rows per file, excluding the header. Team-only rows count toward this limit.`,
    );
    return input;
  }
  if (!input.rows) {
    issue(0, "File", "empty", "Add at least one user or team to the template.");
    return input;
  }
  const people = new Map<string, number>();
  const teams = new Map<string, RosterInput["teams"][number]>();
  records.forEach((cells, index) => {
    const row = index + 2;
    if (!cells.some((value) => value.trim())) return;
    if (cells.length > header.length) {
      issue(row, "Row", "cells", "This row has more cells than the template.");
      return;
    }
    const values = Object.fromEntries(
      ROSTER_IMPORT_COLUMNS.map((column) => [
        column.key,
        (cells[header.indexOf(normalized(column.label))] || "").trim(),
      ]),
    ) as Record<Column, string>;
    const key = values.email ? personKey(values.email) : "row:" + row;
    if (values.name || values.email || values.hireDate) {
      if (!values.email)
        issue(row, "Email", "email", "Add an email for this user.", key);
      else if (!emailValid(values.email))
        issue(
          row,
          "Email",
          "email",
          "Use a valid email, at most 254 characters.",
          key,
        );
      if (values.name.length > 80)
        issue(
          row,
          "Name",
          "name-length",
          "Use a name no longer than 80 characters.",
          key,
        );
      if (values.hireDate && !validDate(values.hireDate))
        issue(
          row,
          "Hire date",
          "hire-date",
          "Use a real calendar date in YYYY-MM-DD format (1900 or later).",
          key,
        );
      if (values.email && people.has(normalized(values.email))) {
        const first = people.get(normalized(values.email))!;
        issue(
          row,
          "Email",
          "duplicate-person",
          "This email is also in row " + first + ". Keep one row per user.",
          key,
        );
        issue(
          first,
          "Email",
          "duplicate-person",
          "This email is also in row " + row + ". Keep one row per user.",
          key,
        );
      } else if (values.email) people.set(normalized(values.email), row);
      input.people.push({
        key,
        email: normalized(values.email),
        row,
        name: values.name || undefined,
        hireDate: values.hireDate || undefined,
        team: values.team || undefined,
      });
    } else if (!values.team)
      issue(row, "Team", "empty-row", "Add a user email or a team name.", key);
    if (!values.team) {
      if (values.parent || values.manager)
        issue(
          row,
          "Team",
          "team-required",
          "Name the team whose parent or manager you are defining.",
          key,
        );
      return;
    }
    const tk = teamKey(values.team);
    if (values.team.length > 80)
      issue(
        row,
        "Team",
        "team-length",
        "Use a team name no longer than 80 characters.",
        tk,
      );
    if (values.parent.length > 80)
      issue(
        row,
        "Parent team",
        "parent-length",
        "Use the immediate parent name, at most 80 characters.",
        tk,
      );
    if (values.manager && !emailValid(values.manager))
      issue(
        row,
        "Team manager email",
        "manager-email",
        "Use a valid manager email, at most 254 characters.",
        tk,
      );
    const saved = teams.get(tk);
    if (saved) {
      saved.rows.push(row);
      if (
        values.parent &&
        saved.parent &&
        normalized(values.parent) !== normalized(saved.parent)
      )
        issue(
          row,
          "Parent team",
          "team-parent-conflict",
          "Rows for " +
            saved.name +
            " name different parents. Make their nonblank parents agree.",
          tk,
        );
      if (
        values.manager &&
        saved.manager &&
        normalized(values.manager) !== normalized(saved.manager)
      )
        issue(
          row,
          "Team manager email",
          "team-manager-conflict",
          "Rows for " +
            saved.name +
            " name different managers. Make their nonblank manager emails agree.",
          tk,
        );
      saved.parent ||= values.parent || undefined;
      saved.manager ||= values.manager ? normalized(values.manager) : undefined;
    } else
      teams.set(tk, {
        key: tk,
        name: values.team,
        rows: [row],
        parent: values.parent || undefined,
        manager: values.manager ? normalized(values.manager) : undefined,
      });
  });
  input.teams = [...teams.values()];
  return input;
}

/** Read-only proposal; temp references never become saved IDs or login identities. */
export function reviewRosterInput(
  input: RosterInput,
  before: Workspace,
  options: {
    deletedEmails?: string[];
    stamp?: string;
    onProposal?: (data: Workspace) => void;
  } = {},
): RosterReview {
  const stamp = options.stamp || new Date().toISOString();
  const review: RosterReview = {
    rows: input.rows,
    people: [],
    teams: [],
    issues: [...input.issues],
    impact: [],
    courses: [],
    affectedPeople: [],
    reviewedAt: stamp,
    governanceRevision: before.governanceRevision,
    valid: false,
  };
  const addIssue = (
    row: number,
    column: string,
    code: string,
    message: string,
    target?: string,
    severity: ImportIssue["severity"] = "error",
  ) => review.issues.push({ row, column, code, message, target, severity });
  const root = organizationTeam(
    before.teams || [],
    before.settings?.organizationTeamId,
  );
  if (!root) {
    addIssue(
      0,
      "Organization",
      "root",
      "Organization setup is inconsistent. Refresh or repair it before reviewing an import.",
    );
    return review;
  }
  const currentPeople = new Map<string, User>();
  for (const person of before.users.filter((p) => p.id !== "guest")) {
    const key = personKey(person.email);
    if (currentPeople.has(key))
      addIssue(
        0,
        "Email",
        "existing-email-conflict",
        "Existing people share an email. Resolve that conflict in People first.",
        key,
      );
    currentPeople.set(key, person);
  }
  const currentTeams = new Map<string, Team>();
  for (const team of before.teams || []) {
    const key = teamKey(team.name);
    if (currentTeams.has(key))
      addIssue(
        0,
        "Team",
        "existing-team-conflict",
        "Existing teams share a name. Give them unique names first.",
        key,
      );
    currentTeams.set(key, team);
  }
  // Organization is a reserved root reference, including older named roots.
  if (!currentTeams.has(teamKey("Organization")))
    currentTeams.set(teamKey("Organization"), root);
  const deleted = new Set((options.deletedEmails || []).map(normalized));
  // Derived membership belongs to the proposal's hierarchy, not its saved projection.
  const nextPeople = new Map<string, User>(
    before.users.map((p) => [p.id, { ...p, effectiveGroupIds: undefined }]),
  );
  const nextTeams = new Map((before.teams || []).map((t) => [t.id, { ...t }]));
  const personIds = new Map(
    [...currentPeople].map(([key, person]) => [key, person.id]),
  );
  const teamIds = new Map(
    [...currentTeams].map(([key, team]) => [key, team.id]),
  );
  const personRows = new Map<string, ImportReviewRow>();
  const newRow = (
    key: string,
    id: string | undefined,
    name: string,
    secondary: string,
    csvRows: number[],
    isNew: boolean,
  ): ImportReviewRow => ({
    key,
    id,
    name,
    secondary,
    csvRows,
    status: isNew ? "new" : "unchanged",
    changes: [],
    values: [],
    notes: [],
    issues: [],
    affected: [],
  });
  const difference = (
    row: ImportReviewRow,
    field: string,
    old: string | undefined,
    value: string | undefined,
  ) => {
    if ((old || "") === (value || "")) return;
    row.changes.push({
      field,
      before: old || "Not set",
      after: value || "Not set",
    });
    if (row.status !== "new") row.status = "changed";
  };
  const teamLabel = (id: string | undefined, teams: Map<string, Team>) =>
    teams.get(id || root.id)?.name || "Organization";
  for (const person of input.people) {
    const email = normalized(person.email);
    const old = currentPeople.get(personKey(person.email));
    const id = old?.id || "csv-preview:" + person.key;
    const duplicate = personRows.get(id);
    if (duplicate) {
      duplicate.csvRows.push(person.row);
      continue;
    }
    const row = newRow(
      person.key,
      id,
      person.name || old?.name || "User in row " + person.row,
      email,
      [person.row],
      !old,
    );
    review.people.push(row);
    personRows.set(id, row);
    if (!email) continue;
    if (!old && !person.name)
      addIssue(
        person.row,
        "Name",
        "name-required",
        "Add a name for this new user.",
        person.key,
      );
    if (deleted.has(email))
      addIssue(
        person.row,
        "Email",
        "deleted-person",
        "This email belongs to a user in Recently deleted. Resolve that record before importing.",
        person.key,
      );
    if (old && !old.active)
      addIssue(
        person.row,
        "Email",
        "inactive-person",
        "This user is inactive. Resolve their access in People before importing.",
        person.key,
      );
    const next: User = old
      ? { ...old, effectiveGroupIds: undefined }
      : {
          id,
          email,
          name: person.name || email,
          role: "learner",
          active: true,
          registered: false,
          groups: [],
          onboardingDays: before.settings?.onboardingDays ?? 90,
        };
    if (person.name) {
      difference(row, "Name", old?.name, person.name);
      next.name = person.name;
    }
    if (person.hireDate && validDate(person.hireDate)) {
      difference(row, "Hire date", old?.hireDate, person.hireDate);
      next.hireDate = person.hireDate;
      if (old && old.hireDate !== person.hireDate) {
        difference(
          row,
          "User type",
          learningStage(old, before.settings, stamp.slice(0, 10)),
          learningStage(next, before.settings, stamp.slice(0, 10)),
        );
        difference(
          row,
          "New-user clock ends",
          onboardingClockTarget(old, before.settings),
          onboardingClockTarget(next, before.settings),
        );
        row.notes.push(
          "Saved course due dates stay fixed. Recalculate deadlines is a separate reviewed action.",
        );
      }
    } else if (!old && !person.hireDate) {
      addIssue(
        person.row,
        "Hire date",
        "missing-hire-date",
        "No hire date: this new user will be an Existing user.",
        person.key,
        "notice",
      );
    }
    if (!old)
      row.notes.push(
        "Pre-registered user. No email or login account is created.",
      );
    nextPeople.set(id, next);
    personIds.set(personKey(person.email), id);
  }
  // Allocate every provisional reference before resolving any parent/manager.
  for (const team of input.teams) {
    const old = currentTeams.get(teamKey(team.name)),
      id = old?.id || "csv-preview:" + team.key;
    teamIds.set(teamKey(team.name), id);
    if (!old) nextTeams.set(id, { id, name: team.name, parentId: root.id });
  }
  for (const team of input.teams) {
    const old = currentTeams.get(teamKey(team.name)),
      id = teamIds.get(teamKey(team.name))!,
      next = nextTeams.get(id)!;
    const row = newRow(
      team.key,
      id,
      old?.name || team.name,
      "",
      team.rows,
      !old,
    );
    review.teams.push(row);
    if (id === root.id && (team.parent || team.manager)) {
      addIssue(
        team.rows[0],
        team.parent ? "Parent team" : "Team manager email",
        "protected-root",
        "Manage the built-in Organization team's manager and structure on its Organization page.",
        team.key,
      );
      continue;
    }
    if (team.parent) {
      const parentId = teamIds.get(teamKey(team.parent));
      if (!parentId)
        addIssue(
          team.rows[0],
          "Parent team",
          "missing-parent",
          "Parent " +
            team.parent +
            " does not exist. Add its user or team-only row, or use an existing team name.",
          team.key,
        );
      else {
        difference(
          row,
          "Parent team",
          old ? teamLabel(old.parentId, nextTeams) : undefined,
          teamLabel(parentId, nextTeams),
        );
        next.parentId = parentId;
      }
    } else if (!old) difference(row, "Parent team", undefined, root.name);
    if (team.manager) {
      const managerId = personIds.get(personKey(team.manager)),
        manager = managerId ? nextPeople.get(managerId) : undefined;
      if (!manager || !manager.active || deleted.has(team.manager))
        addIssue(
          team.rows[0],
          "Team manager email",
          "missing-manager",
          "Manager " +
            team.manager +
            " must be an active existing user or a user row in this file.",
          team.key,
        );
      else {
        difference(
          row,
          "Team manager",
          old?.managerId ? nextPeople.get(old.managerId)?.name : undefined,
          manager.name,
        );
        if (
          old?.managerId !== manager.id &&
          !row.changes.some((c) => c.field === "Team manager")
        )
          difference(
            row,
            "Team manager email",
            old?.managerId ? nextPeople.get(old.managerId)?.email : undefined,
            manager.email,
          );
        next.managerId = manager.id;
        if (manager.role === "learner") {
          manager.role = "manager";
          let pr = personRows.get(manager.id);
          if (!pr) {
            pr = newRow(
              personKey(manager.email),
              manager.id,
              manager.name,
              manager.email,
              team.rows,
              false,
            );
            pr.notes.push(
              "Included because this user will manage " + row.name + ".",
            );
            personRows.set(manager.id, pr);
            review.people.push(pr);
          }
          difference(pr, "Access", "Learner", "Manager");
          row.notes.push(
            manager.name +
              " will gain manager access to this team and its subteams.",
          );
        }
      }
    }
  }
  for (const person of input.people) {
    const id = personIds.get(personKey(person.email)),
      row = review.people.find((r) => r.key === person.key);
    if (!id || !row) continue;
    const old = currentPeople.get(personKey(person.email)),
      next = nextPeople.get(id)!;
    if (person.team) {
      const teamId = teamIds.get(teamKey(person.team));
      if (!teamId)
        addIssue(
          person.row,
          "Team",
          "missing-team",
          "This team could not be resolved.",
          person.key,
        );
      else {
        difference(
          row,
          "Team",
          old ? teamLabel(old.teamId, nextTeams) : undefined,
          teamLabel(teamId, nextTeams),
        );
        next.teamId = teamId === root.id ? undefined : teamId;
      }
    } else if (!old) difference(row, "Team", undefined, root.name);
  }
  // Report each cycle to its declared teams rather than choosing a parent silently.
  const cyclic = new Set<string>();
  for (const team of nextTeams.values()) {
    const seen: string[] = [];
    let cursor: Team | undefined = team;
    while (cursor?.parentId) {
      const loop = seen.indexOf(cursor.id);
      if (loop >= 0) {
        for (const id of seen.slice(loop)) cyclic.add(id);
        break;
      }
      seen.push(cursor.id);
      cursor = nextTeams.get(cursor.parentId);
    }
  }
  for (const row of review.teams.filter((row) => cyclic.has(row.id!)))
    addIssue(
      row.csvRows[0],
      "Parent team",
      "cycle",
      "This parent choice creates a cycle. A team cannot sit beneath itself or one of its descendants.",
      row.key,
    );
  for (const row of [...review.people, ...review.teams]) {
    row.issues = review.issues.filter((issue) => issue.target === row.key);
    if (row.issues.some((issue) => issue.severity === "error"))
      row.status = "issue";
  }
  review.valid = !review.issues.some((issue) => issue.severity === "error");
  if (!review.valid) return review; // Never calculate consequences from an invalid proposal.
  const after: Workspace = {
    ...before,
    users: [...nextPeople.values()],
    teams: [...nextTeams.values()],
  };
  try {
    validateOrganizationTeams(
      after.teams!,
      before.settings?.organizationTeamId,
      before.teams,
      before.settings?.organizationTeamId,
    );
  } catch {
    addIssue(
      0,
      "Teams",
      "hierarchy",
      "The resulting hierarchy is invalid. Refresh Teams and resolve its structure first.",
    );
    review.valid = false;
    return review;
  }
  const summary = {
    assignments: assignmentImpact(before, after),
    reporting: reportingImpact(before, after),
  };
  const impacts = new Map<string, ImportPersonImpact>();
  const impactFor = (person: User) => {
    let impact = impacts.get(person.id);
    if (!impact) {
      impact = {
        id: person.id,
        name: person.name,
        email: person.email,
        coursesAdded: [],
        coursesRemoved: [],
        updatesAdded: 0,
        updatesRemoved: 0,
        reportingAdded: [],
        reportingRemoved: [],
      };
      impacts.set(person.id, impact);
    }
    return impact;
  };
  const courses = new Map<string, { id: string; title: string }>();
  for (const change of summary.assignments) {
    const impact = impactFor(change.person);
    impact.coursesAdded = change.gained.map((c) => c.id);
    impact.coursesRemoved = change.lost.map((c) => c.id);
    for (const { id, title } of [...change.gained, ...change.lost])
      courses.set(id, { id, title });
  }
  review.courses = [...courses.values()];
  for (const person of after.users.filter(
    (p) => p.active && p.id !== "guest",
  )) {
    const previous = before.users.find((p) => p.id === person.id);
    const relevant = (workspace: Workspace, user: User) =>
      new Set(
        (workspace.publishedContent || workspace.content)
          .filter(
            (c) =>
              c.kind === "brief" &&
              c.status === "published" &&
              updateMatchesAudience(c, user, workspace.groups, workspace.teams),
          )
          .map((c) => c.id),
      );
    const was = previous ? relevant(before, previous) : new Set<string>(),
      now = relevant(after, person);
    const added = [...now].filter((id) => !was.has(id)).length,
      removed = [...was].filter((id) => !now.has(id)).length;
    if (added || removed) {
      const impact = impactFor(person);
      impact.updatesAdded = added;
      impact.updatesRemoved = removed;
    }
  }
  for (const change of summary.reporting) {
    const impact = impactFor(change.person);
    (change.change === "Reporting access added"
      ? impact.reportingAdded
      : impact.reportingRemoved
    ).push(change.manager.name);
  }
  review.impact = [...impacts.values()];
  for (const row of review.teams) {
    row.secondary = teamLabel(nextTeams.get(row.id!)?.parentId, nextTeams);
    if (row.status === "unchanged") continue;
    row.affected = after.users
      .filter((person) => {
        const old = before.users.find((p) => p.id === person.id);
        return (
          person.active &&
          (ancestorIds(
            reportingTeamId(person.teamId, after.teams)!,
            after.teams!,
          ).has(row.id!) ||
            (!!old &&
              ancestorIds(
                reportingTeamId(old.teamId, before.teams)!,
                before.teams || [],
              ).has(row.id!)))
        );
      })
      .map((person) => person.id);
  }
  for (const impact of review.impact) {
    let row = personRows.get(impact.id);
    if (!row) {
      row = newRow(
        personKey(impact.email),
        impact.id,
        impact.name,
        impact.email,
        [],
        false,
      );
      row.notes.push("Affected by team or manager changes in this file.");
      review.people.push(row);
      personRows.set(impact.id, row);
    }
    if (row.status === "unchanged") row.status = "changed";
    row.affected = [impact.id];
  }
  const affected = new Set(review.teams.flatMap((r) => r.affected));
  review.affectedPeople = after.users
    .filter((p) => affected.has(p.id))
    .map(({ id, name, email }) => ({ id, name, email }));
  // Project final values after all parents, managers and indirect effects resolve.
  // These fields describe the review; apply still accepts only the original CSV.
  const declaredPeople = new Map(input.people.map((p) => [p.key, p]));
  const declaredTeams = new Map(input.teams.map((t) => [t.key, t]));
  const source = (
    supplied: unknown,
    existing: unknown,
  ): ImportReviewValue["source"] =>
    supplied ? "From CSV" : existing ? "Kept" : "Default";
  const value = (
    field: string,
    text: string | undefined,
    origin: ImportReviewValue["source"],
  ): ImportReviewValue => ({ field, value: text || "Not set", source: origin });
  const hierarchy = (team: Team) => {
    const names: string[] = [];
    const seen = new Set<string>();
    let cursor: Team | undefined = team;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      names.unshift(cursor.name);
      cursor = cursor.parentId ? nextTeams.get(cursor.parentId) : undefined;
    }
    return names.join(" / ");
  };
  for (const row of review.people) {
    const person = nextPeople.get(row.id!)!;
    const declared = declaredPeople.get(row.key);
    const old = currentPeople.get(personKey(person.email));
    const team =
      nextTeams.get(reportingTeamId(person.teamId, after.teams)!) || root;
    const manager = team.managerId ? nextPeople.get(team.managerId) : undefined;
    row.values = [
      value("Name", person.name, source(declared?.name, old)),
      value("Email", person.email, source(declared?.email, old)),
      value("Hire date", person.hireDate, source(declared?.hireDate, old)),
      value("Team", team.name, source(declared?.team, old)),
      value(
        "Parent team",
        nextTeams.get(team.parentId || "")?.name,
        "From team",
      ),
      value("Team manager", manager?.name, "From team"),
      value("Team manager email", manager?.email, "From team"),
      value("Hierarchy", hierarchy(team), "Calculated"),
      value(
        "Access",
        roleLabel(person.role),
        old?.role === person.role
          ? "Kept"
          : old || person.role === "manager"
            ? "Calculated"
            : "Default",
      ),
      value(
        "User type",
        learningStage(person, before.settings, stamp.slice(0, 10)),
        "Calculated",
      ),
      value(
        "New-user clock ends",
        onboardingClockTarget(person, before.settings),
        "Calculated",
      ),
    ];
  }
  for (const row of review.teams) {
    const team = nextTeams.get(row.id!)!;
    const declared = declaredTeams.get(row.key);
    const old = currentTeams.get(teamKey(team.name));
    const manager = team.managerId ? nextPeople.get(team.managerId) : undefined;
    row.values = [
      value("Name", team.name, source(declared?.name, old)),
      value(
        "Parent team",
        nextTeams.get(team.parentId || "")?.name,
        source(declared?.parent, old),
      ),
      value("Team manager", manager?.name, source(declared?.manager, old)),
      value(
        "Team manager email",
        manager?.email,
        source(declared?.manager, old),
      ),
      value("Hierarchy", hierarchy(team), "Calculated"),
    ];
  }
  options.onProposal?.(after);
  return review;
}

export function reviewRosterCsv(
  csv: string,
  before: Workspace,
  options?: Parameters<typeof reviewRosterInput>[2],
) {
  return reviewRosterInput(parseRosterCsv(csv), before, options);
}
/** One validator/proposal boundary for CSV and future roster adapters. */
export function prepareRosterCsv(
  csv: string,
  before: Workspace,
  options?: Parameters<typeof reviewRosterInput>[2],
) {
  let proposal: Workspace | undefined;
  const review = reviewRosterInput(parseRosterCsv(csv), before, {
    ...options,
    onProposal: (value) => {
      proposal = value;
    },
  });
  return { review, proposal };
}
export type RosterImportResult = {
  peopleAdded: number;
  peopleUpdated: number;
  teamsAdded: number;
  teamsUpdated: number;
  revision: number;
  completedAt: string;
};
/** Replace provisional references only after validation; retained IDs are unchanged. */
export function materializeRoster(
  proposal: Workspace,
  review: RosterReview,
  allocate: () => string,
  addedAt = new Date().toISOString(),
): Workspace {
  const ids = new Map<string, string>();
  for (const record of [...review.people, ...review.teams])
    if (record.status === "new" && record.id) ids.set(record.id, allocate());
  const resolve = (id?: string) => (id ? ids.get(id) || id : undefined);
  return {
    ...proposal,
    users: proposal.users.map((p) => ({
      ...p,
      addedAt: ids.has(p.id) ? addedAt : p.addedAt,
      id: resolve(p.id)!,
      teamId: resolve(p.teamId),
    })),
    teams: proposal.teams?.map((t) => ({
      ...t,
      id: resolve(t.id)!,
      parentId: resolve(t.parentId),
      managerId: resolve(t.managerId),
    })),
  };
}
/** Demo stale guard excludes progress, which may change while someone reviews. */
export function rosterBaseline(data: Workspace) {
  return JSON.stringify({
    settings: data.settings,
    users: data.users,
    teams: data.teams,
    groups: data.groups,
    curricula: data.curricula,
    content: data.publishedContent || data.content,
    deleted: data.deletedItems,
    day: new Date().toISOString().slice(0, 10),
  });
}
export function rosterTemplate(): CsvReport {
  return { headings: ROSTER_IMPORT_COLUMNS.map((c) => c.label), rows: [] };
}
export function rosterExample(): CsvReport {
  return {
    ...rosterTemplate(),
    rows: [
      [
        "Avery Rivera",
        "avery@example.test",
        "2025-01-06",
        "Revenue",
        "",
        "avery@example.test",
      ],
      [
        "Jordan Lee",
        "jordan@example.test",
        "2025-04-07",
        "US",
        "Revenue",
        "jordan@example.test",
      ],
      [
        "Morgan Shaw",
        "morgan@example.test",
        "2025-03-03",
        "EMEA",
        "Revenue",
        "morgan@example.test",
      ],
      [
        "Alex Chen",
        "alex@example.test",
        "2026-09-15",
        "Enterprise US",
        "US",
        "jordan@example.test",
      ],
      [
        "Sam Patel",
        "sam@example.test",
        "2026-08-17",
        "Enterprise EMEA",
        "EMEA",
        "morgan@example.test",
      ],
      ["", "", "", "Sales Engineering US", "US", "jordan@example.test"],
    ],
  };
}
export function rosterIssueReport(issues: ImportIssue[]): CsvReport {
  return {
    headings: ["CSV row", "Column", "Severity", "Issue"],
    rows: issues.map((issue) => [
      issue.row || "File",
      issue.column,
      issue.severity === "error" ? "Error" : "Notice",
      issue.message,
    ]),
  };
}
