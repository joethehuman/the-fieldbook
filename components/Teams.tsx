"use client";
import { FormField } from "@/components/patterns/form-field";
import { Alert } from "./ui/alert";
import { useToast } from "./ui/toast";
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
import { ActionGroup } from "@/components/ui/action-group";
import { Input } from "@/components/ui/input";

import {
  Toolbar,
  FilterBar,
  EmptyState,
  SectionHeader,
} from "@/components/patterns/layout";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { completionPercent } from "@/lib/learning";
import { useState } from "react";
import type { Workspace } from "@/lib/store";
import { canParent, reportTeamIds, type Team, type User } from "@/lib/types";
export function TeamsAdmin({
  data,
  onChange,
}: {
  data: Workspace;
  onChange: (d: Workspace) => void | Promise<void>;
}) {
  const teams = data.teams || [];
  const notify = useToast();
  const [editing, setEditing] = useState<Team | null>(null),
    [notice, setNotice] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const name = editing.name.trim();
    if (
      !name ||
      teams.some(
        (t) =>
          t.id !== editing.id && t.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setNotice("Use a unique team name.");
      return;
    }
    if (!canParent(editing.id, editing.parentId || "", teams)) {
      setNotice("A team cannot sit inside itself or one of its subteams.");
      return;
    }
    try {
      await onChange({
        ...data,
        teams: [
          ...teams.filter((t) => t.id !== editing.id),
          { ...editing, name },
        ],
      });
      setEditing(null);
      setNotice("");
      notify("Team saved.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <>
      <Toolbar>
        <p>Teams organize reporting. Groups determine assignments.</p>
        <Button
          variant="default"
          onClick={() => {
            setEditing({ id: crypto.randomUUID(), name: "" });
            setNotice("");
          }}
        >
          Add team
        </Button>
      </Toolbar>
      {notice && <Alert variant="destructive">{notice}</Alert>}
      {editing && (
        <form className="grid gap-4" onSubmit={save}>
          <FilterBar>
            <FormField label="Team name">
              <Input
                required
                maxLength={80}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </FormField>
            <FormField label="Parent team">
              <SelectField
                value={editing.parentId || ""}
                onValueChange={(value) =>
                  setEditing({
                    ...editing,
                    parentId: value || undefined,
                  })
                }
              >
                <option value="">Top-level team</option>
                {teams
                  .filter((t) => canParent(editing.id, t.id, teams))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </SelectField>
            </FormField>
            <FormField
              label="Manager"
              description="Assigning a manager grants reporting access for this team and its subteams."
            >
              <SelectField
                value={editing.managerId || ""}
                onValueChange={(value) =>
                  setEditing({
                    ...editing,
                    managerId: value || undefined,
                  })
                }
              >
                <option value="">No manager</option>
                {data.users
                  .filter(
                    (u) =>
                      u.active && (u.role === "manager" || u.role === "admin"),
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </SelectField>
            </FormField>
          </FilterBar>
          <ActionGroup>
            <Button variant="default">Save team</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </ActionGroup>
        </form>
      )}
      <TableContainer>
        <DataTable layout="teams">
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead align="right">Direct members</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <strong>{t.name}</strong>
                </TableCell>
                <TableCell>
                  {teams.find((p) => p.id === t.parentId)?.name || "—"}
                </TableCell>
                <TableCell>
                  {data.users.find((u) => u.id === t.managerId)?.name ||
                    "Unassigned"}
                </TableCell>
                <TableCell align="right">
                  {
                    data.users.filter((u) => u.active && u.teamId === t.id)
                      .length
                  }
                </TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    onClick={() => {
                      setEditing({ ...t });
                      setNotice("");
                    }}
                  >
                    Edit team
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
      {!teams.length && (
        <EmptyState>
          Create your first team, then assign its members in Profiles.
        </EmptyState>
      )}
    </>
  );
}
export function TeamProgress({ data, user }: { data: Workspace; user: User }) {
  const teams = data.teams || [];
  const allowed = reportTeamIds(user, teams);
  const [teamId, setTeamId] = useState("all"),
    [query, setQuery] = useState(""),
    [person, setPerson] = useState("");
  const rows = teamProgressRows(data, user, teamId, query);
  const users = rows.map((r) => r.u);
  const total = rows.reduce((n, r) => n + r.assigned.length, 0),
    done = rows.reduce((n, r) => n + r.completed, 0);
  if (!user.active || !["admin", "manager"].includes(user.role))
    return (
      <EmptyState>
        Reporting requires an administrator or manager account.
      </EmptyState>
    );
  return (
    <>
      <SectionHeader
        title={<h2>People & completion</h2>}
        description="Understand completion across your reporting scope."
      >
        <CsvExport
          filename="team-progress"
          report={() => teamProgressCsv(rows)}
        />
      </SectionHeader>
      <FilterBar>
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
                  {t.name}
                </option>
              ))}
          </SelectField>
        </FormField>
        <FormField label="Find a team member">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPerson("");
            }}
            placeholder="Name or email"
          />
        </FormField>
      </FilterBar>
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
      <TableContainer>
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
                  <Button variant="link" onClick={() => setPerson(u.id)}>
                    View courses
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
      {!users.length && (
        <EmptyState>No team members match this view.</EmptyState>
      )}
      {rows
        .filter((r) => r.u.id === person)
        .map(({ u, assigned }) => {
          const courses = assigned.map((c) =>
            courseProgressRow(data, u, c, "team"),
          );
          return (
            <Card className="grid gap-4" key={u.id}>
              <SectionHeader title={<h2>{u.name}’s assignments</h2>}>
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
