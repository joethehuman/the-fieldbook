"use client";
import { CollectionControls, CollectionEmpty } from "./patterns/collection-controls";
import { DetailNavigation } from "./patterns/detail-navigation";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { FormField } from "@/components/patterns/form-field";
import { CsvExport } from "./patterns/csv-export";
import {
  teamProgressRows,
  teamProgressCsv,
  courseProgressRow,
  courseProgressCsv,
} from "@/lib/reporting";
import { DataTable } from "./patterns/data-table";
import { Card } from "@/components/ui/card";
import {
  TableContainer,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";

import {
  EmptyState,
  SectionHeader,
} from "@/components/patterns/layout";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { completionPercent } from "@/lib/learning";
import { useEffect, useState } from "react";
import type { RegisterLandingNavigation } from "@/lib/navigation-guard";
import type { Workspace } from "@/lib/store";
import { reportTeamIds, type User } from "@/lib/types";
import { teamPath } from "@/lib/team-hierarchy";
export { TeamsAdmin } from "./TeamManagement";
export function TeamProgress({
  data,
  user,
  registerLandingNavigation,
}: {
  data: Workspace;
  user: User;
  registerLandingNavigation?: RegisterLandingNavigation;
}) {
  const overview = useRevealTarget<HTMLHeadingElement>();
  const assignments = useRevealTarget<HTMLElement>();
  const teams = data.teams || [];
  const allowed = reportTeamIds(user, teams);
  const [teamId, setTeamId] = useState("all"),
    [query, setQuery] = useState(""),
    [person, setPerson] = useState("");
  const [sort, setSort] = useState("name");
  useEffect(() => {
    registerLandingNavigation?.({
      isCurrent: !person,
      open: () => {
        setPerson("");
        overview.reveal();
      },
    });
    return () => registerLandingNavigation?.(null);
  });
  const clearFilters = () => { setTeamId("all"); setQuery(""); setPerson(""); };
  const rows = teamProgressRows(data, user, teamId, query).sort((a, b) => (sort === "reverse" ? b.u.name.localeCompare(a.u.name) : a.u.name.localeCompare(b.u.name)) || a.u.id.localeCompare(b.u.id));
  const users = rows.map((r) => r.u);
  const total = rows.reduce((n, r) => n + r.assigned.length, 0),
    done = rows.reduce((n, r) => n + r.completed, 0);
  if (!user.active || !["admin", "manager", "contributor"].includes(user.role))
    return (
      <EmptyState>
        Reporting requires an administrator or manager account.
      </EmptyState>
    );
  return (
    <>
      <SectionHeader variant="page" title={<h2 {...overview.targetProps}>People & completion</h2>}>
        <CsvExport
          filename="team-progress"
          report={() => teamProgressCsv(rows)}
        />
      </SectionHeader>
      <CollectionControls sortLabel={sort === "name" ? "Name A–Z" : "Name Z–A"}
        sort={<FormField label="Sort team members"><SelectField value={sort} onValueChange={setSort}><option value="name">Name A–Z</option><option value="reverse">Name Z–A</option></SelectField></FormField>}
        filters={[...(query ? [{ id: "query", label: `Search: ${query}`, onRemove: () => { setQuery(""); setPerson(""); } }] : []), ...(teamId !== "all" ? [{ id: "team", label: teamPath(teamId, teams), onRemove: () => { setTeamId("all"); setPerson(""); } }] : [])]}
        onClear={clearFilters} search={
        <FormField label="Find a team member" visuallyHiddenLabel>
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPerson("");
            }}
            placeholder="Find a team member by name or email"
          />
        </FormField>
      }>
        <FormField label="Reporting team">
          <SelectField
            value={teamId}
            onValueChange={(value) => {
              setTeamId(value);
              setPerson("");
            }}
          >
            <option value="all">
              {user.role === "admin" ? "Entire organization" : "All my teams"}
            </option>
            {teams
              .filter((t) => allowed.has(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {teamPath(t.id, teams)}
                </option>
              ))}
          </SelectField>
        </FormField>
      </CollectionControls>
      <p className="muted">
        Includes subteams. Completion uses the latest published course versions.
      </p>
      <div className="report-summary">
        <strong>{users.length} people</strong>
        <span>
          {done} of {total} assignments complete
        </span>
        <span>
          {total
            ? completionPercent(done, total) + "% complete"
            : "No assignments"}
        </span>
      </div>
      {!!rows.length && <TableContainer>
        <DataTable layout="progress">
          <TableHeader>
            <TableRow>
              <TableHead>Team member</TableHead>
              <TableHead>Team</TableHead>
              <TableHead align="right">Assigned</TableHead>
              <TableHead align="right">Completed</TableHead>
              <TableHead align="right">Complete</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ u, assigned, completed, team, percent, status }) => (
              <TableRow key={u.id}>
                <TableCell>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </TableCell>
                <TableCell>{team}</TableCell>
                <TableCell align="right">
                  {assigned.length}
                  <small>{status}</small>
                </TableCell>
                <TableCell align="right">{completed}</TableCell>
                <TableCell align="right">
                  {percent !== null ? percent + "%" : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    onClick={() => {
                      setPerson(u.id);
                      assignments.reveal();
                    }}
                  >
                    View courses
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>}
      <CollectionEmpty count={users.length} total={teamProgressRows(data, user, "all", "").length} noun="team members" onClear={clearFilters} />
      {rows
        .filter((r) => r.u.id === person)
        .map(({ u, assigned }) => {
          const courses = assigned.map((c) =>
            courseProgressRow(data, u, c, "team"),
          );
          return (
            <Card
              {...assignments.targetProps}
              aria-label={`${u.name}’s assignments`}
              className="grid gap-4"
              key={u.id}
            >
              <DetailNavigation
                items={[{ label: "Back to people & completion", onSelect: () => {
                  setPerson("");
                  overview.reveal();
                } }]}
                current={u.name}
              />
              <SectionHeader title={<h3>{u.name}’s assignments</h3>}>
                <CsvExport
                  filename={`${u.name}-assignments`}
                  report={() => courseProgressCsv(courses, "team")}
                />
              </SectionHeader>
              {courses.map(({ c, target, status }) => {
                return (
                  <div className="report-course" key={c.id}>
                    <div>
                      <strong>{c.title}</strong>
                      <small className="block text-muted-foreground">
                        {c.category} · v{c.version}
                        {target ? ` · Target ${target}` : ""}
                      </small>
                    </div>
                    <span>{status}</span>
                  </div>
                );
              })}
              {!assigned.length && <p>No assigned courses.</p>}
            </Card>
          );
        })}
    </>
  );
}
