"use client";
import { useState } from "react";
import type { Workspace } from "@/lib/store";
import type { BulkHandler } from "@/lib/bulk-actions";
import { AdminBulkActions } from "./AdminBulkActions";
import { SelectRows, useBulkSelection } from "./patterns/bulk-selection";
import { FilterOptions } from "./patterns/filter-options";
import { DataTable } from "./patterns/data-table";
import { Checkbox } from "./ui/choice";
import {
  TableContainer,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/table";
import { Alert } from "./ui/alert";
export function RecentlyDeleted({
  data,
  onBulk,
}: {
  data: Workspace;
  onBulk: BulkHandler;
}) {
  const [filter, setFilter] = useState("all");
  const selection = useBulkSelection(filter);
  const displayData = {
    ...data,
    deletedItems: data.deletedItems?.map((d) => ({
      ...d,
      id: `${d.entity}:${d.id}`,
    })),
  };
  const rows = (displayData.deletedItems || []).filter(
    (d) => filter === "all" || d.entity === filter,
  );
  return (
    <div className="grid gap-4">
      <p>
        Deleted items can be recovered for 30 days. Permanent deletion also
        erases associated learning history and feedback. Restored content is a
        draft; restored users need an access review.
      </p>
      {data.cleanupStatus &&
        (!data.cleanupStatus.configured ||
          !data.cleanupStatus.lastRun ||
          Date.now() - Date.parse(data.cleanupStatus.lastRun) >
            2 * 60 * 60 * 1000) && (
          <Alert variant="destructive">
            Automatic deletion needs operator attention. Check the cleanup
            endpoint and scheduler. Overdue items stay inactive until cleanup
            succeeds.
          </Alert>
        )}
      <FilterOptions
        label="Deleted item type"
        value={filter}
        onValueChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "content", label: "Content" },
          { value: "user", label: "Users" },
        ]}
      />
      {selection.notice && <p role="status">{selection.notice}</p>}
      <AdminBulkActions
        data={displayData}
        selected={selection.selected}
        onSelectionChange={selection.setSelected}
        recovery
        onBulk={async (request) => {
          const results = [];
          for (const entity of ["content", "user"] as const) {
            const items = request.items
              .filter((i) => i.id.startsWith(entity + ":"))
              .map((i) => ({ ...i, id: i.id.slice(entity.length + 1) }));
            if (items.length)
              results.push(
                ...(await onBulk({ ...request, entity, items })).map((r) => ({
                  ...r,
                  id: `${entity}:${r.id}`,
                })),
              );
          }
          return results;
        }}
      />
      <TableContainer>
        <DataTable layout="deleted">
          <TableHeader>
            <TableRow>
              <TableHead>
                <SelectRows
                  ids={rows
                    .filter(
                      (d) =>
                        !d.purging && Date.parse(d.purgeAfter) > Date.now(),
                    )
                    .map((d) => d.id)}
                  value={selection.selected}
                  onChange={selection.setSelected}
                />
              </TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Deleted</TableHead>
              <TableHead>Deleted by</TableHead>
              <TableHead>Permanent deletion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={`${d.entity}:${d.id}`}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${d.name}`}
                    disabled={
                      d.purging || Date.parse(d.purgeAfter) <= Date.now()
                    }
                    checked={selection.selected.includes(d.id)}
                    onCheckedChange={(v) => selection.toggle(d.id, v === true)}
                  />
                </TableCell>
                <TableCell>
                  <strong>{d.name}</strong>
                  <small>
                    {d.entity === "user"
                      ? "User"
                      : d.kind === "brief"
                        ? "Update"
                        : d.kind === "doc"
                          ? "Doc"
                          : "Course"}
                  </small>
                </TableCell>
                <TableCell>{new Date(d.deletedAt).toLocaleString()}</TableCell>
                <TableCell>{d.deletedBy}</TableCell>
                <TableCell>
                  {new Date(d.purgeAfter).toLocaleString()}
                  {d.error && (
                    <Alert variant="destructive">
                      Deletion delayed. The worker will retry.
                    </Alert>
                  )}
                  {!d.purging && Date.parse(d.purgeAfter) <= Date.now() && (
                    <small>Awaiting scheduled cleanup</small>
                  )}
                  {d.purging && <small>Permanent deletion in progress</small>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
      {!rows.length && <p>No recently deleted items.</p>}
    </div>
  );
}
