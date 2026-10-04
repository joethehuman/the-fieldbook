"use client";
import { useState } from "react";
import { GraduationCap, Network, Users } from "lucide-react";
import { DataTable } from "@/components/patterns/data-table";
import {
  RecordListRow,
  RecordMeta,
  RecordName,
  RecordProgress,
} from "@/components/patterns/record-row";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RecordCardDetail,
  RecordCardFooter,
} from "@/components/patterns/record-card";
import { RowActions } from "@/components/patterns/row-actions";
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CountMetric } from "@/components/ui/count-metric";
import { Checkbox } from "@/components/ui/choice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function RecordExamples() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  return (
    <div className="grid min-w-0 gap-6">
      <TableContainer aria-label="Compact records example">
        <DataTable density="compact" layout="progressPeopleNoDates">
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Reporting team</TableHead>
              <TableHead>User type</TableHead>
              <TableHead>Completion</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              {
                name: "Alex Morgan",
                email: "alex@example.test",
                percent: 75,
                completed: 3,
                status: "Within due dates",
                overdue: 0,
              },
              {
                name: "Taylor Rivera",
                email: "taylor.rivera@example.test",
                percent: 100,
                completed: 4,
                status: "Up to date",
                overdue: 0,
              },
              {
                name: "Jordan Chen",
                email: "jordan@example.test",
                percent: 0,
                completed: 0,
                status: "Overdue",
                overdue: 2,
              },
            ].map((person) => (
              <TableRow key={person.email}>
                <TableCell>
                  <RecordName onClick={() => setOpen(true)}>
                    {person.name}
                  </RecordName>
                  <RecordMeta title={person.email}>{person.email}</RecordMeta>
                </TableCell>
                <TableCell>Customer success</TableCell>
                <TableCell>Existing user</TableCell>
                <TableCell>
                  <RecordProgress
                    percent={person.percent}
                    completed={person.completed}
                    assigned={4}
                    status={person.status}
                    overdue={person.overdue}
                  />
                </TableCell>
                <TableCell>
                  <RowActions
                    label={person.name}
                    actions={[
                      { label: "View courses", onSelect: () => setOpen(true) },
                      { label: "Edit", onSelect: () => setOpen(true) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
      <div className="overflow-hidden rounded-lg border border-border">
        <RecordListRow
          selection={
            <Checkbox
              aria-label="Select example team"
              checked={selected}
              onCheckedChange={(value) => setSelected(value === true)}
            />
          }
          identity={
            <>
              <RecordName onClick={() => setOpen(true)}>
                Customer success managers
              </RecordName>
              <RecordMeta>Customer success / North America</RecordMeta>
            </>
          }
          detail="Manager: Taylor Rivera"
          metrics={
            <>
              <CountMetric
                icon={<Users className="size-3" />}
                value={12}
                label="12 direct members"
              />
              <CountMetric
                icon={<Network className="size-3" />}
                value={3}
                label="3 subteams"
              />
            </>
          }
          actions={
            <RowActions
              label="example team"
              actions={[
                { label: "Open team", onSelect: () => setOpen(true) },
                { label: "Edit team", onSelect: () => setOpen(true) },
              ]}
            />
          }
        />
      </div>
      <Card
        className="flex max-w-sm flex-col p-0 sm:p-0"
        aria-label="Curriculum card example"
      >
        <CardContent className="grid gap-4">
          <Badge variant="success">Published</Badge>
          <h3>
            <RecordName onClick={() => setOpen(true)}>
              Company foundations
            </RecordName>
          </h3>
          <p>Find your way around and build good working habits.</p>
        </CardContent>
        <RecordCardFooter
          actions={
            <RowActions
              label="Company foundations"
              actions={[
                { label: "Edit curriculum", onSelect: () => setOpen(true) },
                { label: "Edit audience", onSelect: () => setOpen(true) },
                {
                  label: "Delete curriculum",
                  destructive: true,
                  separator: true,
                  onSelect: () => setOpen(true),
                },
              ]}
            />
          }
        >
          <RecordCardDetail icon={<GraduationCap aria-hidden="true" />}>
            3 courses
          </RecordCardDetail>
          <RecordCardDetail icon={<Users aria-hidden="true" />}>
            Everyone in the organization
          </RecordCardDetail>
        </RecordCardFooter>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogBody>
            <DialogTitle>Record details</DialogTitle>
            <DialogDescription>
              This catalog example demonstrates opening a dialog from a record
              name or its action menu.
            </DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
