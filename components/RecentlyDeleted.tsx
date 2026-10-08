"use client";
import { compareOptionalDates, sortLabels } from "@/lib/collection-sort";
import { SortPicker } from "./patterns/sort-picker";
import { Pagination } from "./patterns/pagination";
import { FormField } from "./patterns/form-field";
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useState } from "react";
import type { Workspace } from "@/lib/store";
import type { BulkHandler } from "@/lib/bulk-actions";
import { AdminBulkActions, adminCommands } from "./AdminBulkActions";
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
import { ItemActions } from "./patterns/bulk-actions";
import { Alert } from "./ui/alert";
export function RecentlyDeleted({
  data,
  onBulk,
  contentOnly = false,
  filter: controlledFilter,
  onFilterChange,
}: {
  data: Workspace;
  onBulk: BulkHandler;
  contentOnly?: boolean;
  filter?: string;
  onFilterChange?: (filter: string) => void;
}) {
  const [localFilter, setLocalFilter] = useState("all");
  const filter = controlledFilter ?? localFilter;
  const setFilter = (next: string) => { if (onFilterChange) onFilterChange(next); else setLocalFilter(next); };
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const clearFilters = () => { setFilter("all"); setQuery(""); setPage(1); };
  const displayData = {
    ...data,
    deletedItems: data.deletedItems?.filter((item) => !contentOnly || item.entity === "content").map((d) => ({
      ...d,
      id: `${d.entity}:${d.id}`,
    })),
  };
  const rows = (displayData.deletedItems || []).filter(
    (d) =>
      (filter === "all" || d.entity === filter) &&
      d.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selection = useBulkSelection(
    filter + query,
    rows.map((d) => d.id),
    rows
      .filter((d) => !d.purging && Date.parse(d.purgeAfter) > Date.now())
      .map((d) => d.id),
  );
  rows.sort((a, b) => {
    const name = a.name.localeCompare(b.name);
    return (
      (sort === "newest" || sort === "oldest"
        ? compareOptionalDates(a.deletedAt, b.deletedAt, sort === "newest")
        : 0) ||
      (sort === "reverse" ? -name : name) ||
      a.id.localeCompare(b.id)
    );
  });
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)));
  const visible = rows.slice((currentPage - 1) * 25, currentPage * 25);
  const restore: BulkHandler = async (request) => {
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
  };
  return (
    <div className="grid gap-4">
      <p>
        Deleted items can be recovered for 30 days. Permanent deletion also
        erases associated learning history and feedback. Restored content is a
        draft{contentOnly ? "." : "; restored users need an access review."}
      </p>
      {!contentOnly &&
        data.cleanupStatus &&
        (!data.cleanupStatus.configured ||
          !data.cleanupStatus.lastRun ||
          Date.now() - Date.parse(data.cleanupStatus.lastRun) >
            2 * 60 * 60 * 1000) && (
          <Alert variant="destructive">
            Automatic deletion is delayed. Check the cleanup endpoint and scheduler.
          </Alert>
        )}
      {!contentOnly && (
        <FilterOptions
          label="Deleted item type"
          variant="underline"
          value={filter}
          onValueChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "content", label: "Content" },
            { value: "user", label: "Users" },
          ]}
        />
      )}
      <CollectionControls
        search={
          <FormField label="Search recently deleted" visuallyHiddenLabel>
            <Input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search recently deleted"
            />
          </FormField>
        }
        sort={
          <SortPicker
            label="Sort deleted items"
            value={sort}
            onValueChange={(value) => { setSort(value); setPage(1); }}
          >
            <option value="newest">{sortLabels.deletedNewest}</option>
            <option value="oldest">{sortLabels.deletedOldest}</option>
            <option value="name">{sortLabels.nameAsc}</option>
            <option value="reverse">{sortLabels.nameDesc}</option>
          </SortPicker>
        }
        onClear={clearFilters}
        filters={query ? [{
          id: "query", label: `Search: ${query}`,
          onRemove: () => { setQuery(""); setPage(1); },
        }] : []}
      />
      <AdminBulkActions
        data={displayData}
        range={
          rows.length
            ? `${(currentPage - 1) * 25 + 1}–${Math.min(currentPage * 25, rows.length)} of ${rows.length} shown`
            : undefined
        }
        collectionSize={selection.collectionSize}
        selected={selection.actionIds}
        onSelectionChange={selection.setSelected}
        recovery
        onBulk={restore}
      />
      {!!rows.length && (
        <TableContainer>
          <DataTable layout="deleted">
            <TableHeader>
              <TableRow>
                <TableHead>
                  {selection.canSelect && (
                    <SelectRows
                      ids={visible
                        .filter(
                          (d) =>
                            !d.purging && Date.parse(d.purgeAfter) > Date.now(),
                        )
                        .map((d) => d.id)}
                      value={selection.selected}
                      onChange={selection.setSelected}
                    />
                  )}
                </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead>Deleted by</TableHead>
                <TableHead>Permanent deletion</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((d) => (
              <TableRow key={`${d.entity}:${d.id}`}>
                <TableCell>
                  {selection.canSelect && (
                    <Checkbox
                      aria-label={`Select ${d.name}`}
                      disabled={
                        d.purging || Date.parse(d.purgeAfter) <= Date.now()
                      }
                      checked={selection.selected.includes(d.id)}
                      onCheckedChange={(v) =>
                        selection.toggle(d.id, v === true)
                      }
                    />
                  )}
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
                      Deletion is delayed. The cleanup worker will retry automatically.
                    </Alert>
                  )}
                  {!d.purging && Date.parse(d.purgeAfter) <= Date.now() && (
                    <small>Awaiting scheduled cleanup</small>
                  )}
                  {d.purging && <small>Permanent deletion in progress</small>}
                </TableCell>
              <TableCell>
                    <ItemActions
                      id={d.id}
                      label={d.name}
                      disabled={
                        d.purging || Date.parse(d.purgeAfter) <= Date.now()
                      }
                      commands={adminCommands({
                        data: displayData,
                        selected: [d.id],
                        recovery: true,
                        onBulk: restore,
                      })}
                      onSelectionChange={(ids) => {
                        if (!ids.length)
                          selection.setSelected(
                            selection.selected.filter((id) => id !== d.id),
                          );
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </TableContainer>
      )}
      {rows.length > 25 && (
        <Button
          type="button"
          variant="link"
          onClick={() =>
            selection.setSelected(
              rows
                .filter(
                  (d) => !d.purging && Date.parse(d.purgeAfter) > Date.now(),
                )
                .map((d) => d.id),
            )
          }
        >
          Select all matching recoverable items
        </Button>
      )}
      <Pagination
        label="Recently deleted"
        showCount={false}
        page={currentPage}
        pageSize={25}
        total={rows.length}
        onPageChange={setPage}
      />
      <CollectionEmpty count={rows.length} total={data.deletedItems?.length || 0} noun="recently deleted items" onClear={clearFilters} />
    </div>
  );
}
