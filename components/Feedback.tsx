"use client";
import { MessageSquare } from "lucide-react";
import { SortPicker } from "./patterns/sort-picker";
import { DetailNavigation } from "./patterns/detail-navigation";
import { DataTable } from "./patterns/data-table";
import { HierarchyPicker } from "./patterns/hierarchy-picker";
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { DistributionBar } from "./ui/distribution-bar";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { FormField } from "@/components/patterns/form-field";
import {
  CollectionControls,
  CollectionEmpty,
} from "./patterns/collection-controls";
import { FilterOptions } from "./patterns/filter-options";
import { ContentFeedback } from "./patterns/content-feedback";
import { CsvExport } from "./patterns/csv-export";
import { feedbackRows, feedbackCsv } from "@/lib/reporting";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/patterns/layout";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { SelectField } from "./ui/select";
import { useState } from "react";
import { Checkbox } from "./ui/choice";
import {
  BulkActions,
  ItemActions,
  type BulkCommand,
} from "./patterns/bulk-actions";
import { SelectRows, useBulkSelection } from "./patterns/bulk-selection";
import type { Content, User, Feedback as Entry } from "@/lib/types";
import type { Workspace } from "@/lib/store";
export default function Feedback({
  content,
  user,
  data,
  onChange,
  expanded = false,
}: {
  content: Content;
  user: User;
  data: Workspace;
  onChange: (d: Workspace) => void | Promise<void>;
  expanded?: boolean;
}) {
  async function save(
    rating: Entry["rating"],
    text: string,
    submissionId: string,
  ) {
    const next: Entry = {
      id: submissionId,
      userId: user.id,
      contentId: content.id,
      version: content.version,
      rating,
      comment: text.trim(),
      updatedAt: new Date().toISOString(),
    };
    await onChange({
      ...data,
      feedback: [
        ...(data.feedback || []).filter((f) => f.id !== submissionId),
        next,
      ],
    });
  }
  return (
    <ContentFeedback
      key={`${content.id}:${user.id}`}
      onSave={save}
      expanded={expanded}
    />
  );
}

export function FeedbackAdmin({
  data,
  onDeleteFeedback,
}: {
  data: Workspace;
  onDeleteFeedback?: (ids: string[]) => Promise<void>;
}) {
  const [kind, setKind] = useState("all"),
    [item, setItem] = useState("all"),
    [rating, setRating] = useState("all"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("newest");
  const scope = useRevealTarget<HTMLHeadingElement>({ context: true });
  const selectedItem = data.content.find((c) => c.id === item);
  function viewItem(id: string) {
    setKind("all");
    setRating("all");
    setQuery("");
    setItem(id);
    scope.reveal();
  }
  const clearFilters = () => {
    setQuery("");
    setRating("all");
    setItem("all");
    setKind("all");
  };
  const ratingRecords = feedbackRows(data, kind, item, "all", query, sort);
  const records =
    rating === "all"
      ? ratingRecords
      : ratingRecords.filter((record) => record.rating === rating);
  const ids = records.map((record) => record.id);
  const selection = useBulkSelection(
    JSON.stringify([kind, item, rating, query]),
    ids,
  );
  const selectable = !!onDeleteFeedback && selection.canSelect;
  const commands: BulkCommand[] = onDeleteFeedback
    ? [
        {
          id: "delete",
          label: "Delete selected feedback",
          itemLabel: "Delete feedback",
          destructive: true,
          description: ({ count }) =>
            `Permanently delete ${count === 1 ? "this feedback entry" : `these ${count} feedback entries`}? This cannot be undone.`,
          successMessage: "Feedback deleted.",
          apply: async (_values, selectedIds) => {
            await onDeleteFeedback(selectedIds || []);
          },
        },
      ]
    : [];
  const positive = ratingRecords.filter((f) => f.rating === "up").length;
  return (
    <>
      <div data-reveal-context className="grid gap-4">
        {item !== "all" && (
          <DetailNavigation
            items={[{ label: "All feedback", onSelect: () => viewItem("all") }]}
            current={selectedItem?.title}
          />
        )}
        <SectionHeader
          variant="page"
          title={
            <h2 {...scope.targetProps}>
              {selectedItem ? `Feedback for ${selectedItem.title}` : "Feedback"}
            </h2>
          }
          description="See what readers and learners are telling you."
        >
          <CsvExport filename="feedback" report={() => feedbackCsv(records)} />
        </SectionHeader>
      </div>
      <FilterOptions
        label="Feedback type"
        variant="underline"
        value={kind}
        onValueChange={(value) => {
          setKind(value);
          setItem("all");
        }}
        options={[
          { value: "all", label: "All" },
          { value: "doc", label: "Docs" },
          { value: "brief", label: "Updates" },
          { value: "course", label: "Courses" },
          { value: "general", label: "General" },
        ]}
      />
      <CollectionControls
        sort={
          <SortPicker
            label="Sort feedback"
            value={sort}
            onValueChange={setSort}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </SortPicker>
        }
        onClear={clearFilters}
        filters={[
          ...(rating !== "all"
            ? [
                {
                  id: "rating",
                  label: rating === "up" ? "Useful" : "Not useful",
                  onRemove: () => setRating("all"),
                },
              ]
            : []),
          ...(item !== "all"
            ? [
                {
                  id: "item",
                  label: selectedItem?.title || "Selected item",
                  onRemove: () => setItem("all"),
                },
              ]
            : []),
        ]}
        search={
          <FormField label="Search feedback" visuallyHiddenLabel>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search feedback by content title or comment"
            />
          </FormField>
        }
      >
        <FormField label="Feedback rating">
          <SelectField value={rating} onValueChange={setRating}>
            <option value="all">All ratings</option>
            <option value="up">Useful</option>
            <option value="down">Not useful</option>
          </SelectField>
        </FormField>
        <FormField label="Content item">
          <HierarchyPicker
            value={item}
            onValueChange={setItem}
            searchLabel="Search content items"
            searchPlaceholder="Search content titles"
            emptyMessage="No matching content."
            showFullHierarchy={false}
            options={[
              { id: "all", label: "All feedback", path: [] },
              ...data.content
                .filter((c) => kind === "all" || c.kind === kind)
                .sort(
                  (a, b) =>
                    a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
                )
                .map((c) => ({
                  id: c.id,
                  label: c.title,
                  path: [
                    c.kind === "doc"
                      ? "Docs"
                      : c.kind === "brief"
                        ? "Updates"
                        : "Courses",
                    c.title,
                  ],
                })),
            ]}
          />
        </FormField>
      </CollectionControls>
      <div className="report-summary">
        <strong>
          {ratingRecords.length}{" "}
          {ratingRecords.length === 1 ? "rating" : "ratings"}
        </strong>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-6 rounded-full bg-success/10 px-2 py-0 text-xs leading-6 text-success hover:bg-success/20 hover:text-success aria-pressed:border-success aria-pressed:bg-success/20"
            aria-pressed={rating === "up"}
            onClick={() =>
              setRating((current) => (current === "up" ? "all" : "up"))
            }
          >
            {positive} useful
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-6 rounded-full bg-muted px-2 py-0 text-xs leading-6 hover:bg-muted-hover aria-pressed:border-muted-foreground aria-pressed:bg-muted-hover"
            aria-pressed={rating === "down"}
            onClick={() =>
              setRating((current) => (current === "down" ? "all" : "down"))
            }
          >
            {ratingRecords.length - positive} not useful
          </Button>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
          <div className="w-14 shrink-0 [&_[data-slot=distribution-bar]]:h-1.5">
            <DistributionBar
              label="Feedback ratings"
              segments={[
                {
                  id: "useful",
                  label: "Useful",
                  count: positive,
                  tone: "success-soft",
                },
                {
                  id: "not-useful",
                  label: "Not useful",
                  count: ratingRecords.length - positive,
                  tone: "muted",
                },
              ]}
            />
          </div>
          <span>
            {ratingRecords.length ? (
              <>
                <span className="font-semibold text-foreground">
                  {Math.round((positive / ratingRecords.length) * 100)}%
                </span>{" "}
                positive
              </>
            ) : (
              "No ratings yet"
            )}
          </span>
        </div>
      </div>
      {onDeleteFeedback && (
        <BulkActions
          selected={selection.selected}
          collectionSize={records.length}
          onSelectionChange={selection.setSelected}
          commands={commands}
          noun="feedback entries"
          summaryControl={
            selectable ? (
              <SelectRows
                ids={ids}
                value={selection.selected}
                onChange={selection.setSelected}
                label="Select all filtered feedback"
              />
            ) : (
              <span aria-hidden="true" className="h-control w-4" />
            )
          }
        />
      )}
      {!!records.length && (
        <TableContainer aria-label="Feedback table">
          <DataTable
            layout={onDeleteFeedback ? "feedbackSelection" : "feedback"}
            density="compact"
            className="[&_[data-slot=table-cell-content]]:whitespace-nowrap"
          >
            <TableHeader>
              <TableRow>
                {onDeleteFeedback && (
                  <TableHead>
                    <span className="sr-only">Select feedback</span>
                  </TableHead>
                )}
                <TableHead>Content</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((f) => (
                <TableRow key={f.id}>
                  {onDeleteFeedback && (
                    <TableCell>
                      {selectable && (
                        <Checkbox
                          aria-label={`Select feedback from ${f.person} for ${f.title}`}
                          checked={selection.selected.includes(f.id)}
                          onCheckedChange={(checked) =>
                            selection.toggle(f.id, checked === true)
                          }
                        />
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex w-44 items-center gap-2">
                      <span
                        className="min-w-0 truncate font-medium"
                        title={f.title}
                      >
                        {f.title}
                      </span>
                      {!!f.version && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          v{f.version}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{f.kind}</TableCell>
                  <TableCell>
                    <span className="block w-28 truncate" title={f.person}>
                      {f.person}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.rating === "up" ? "success" : "default"}>
                      {f.ratingLabel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <FeedbackComment entry={f} />
                  </TableCell>
                  <TableCell>
                    <time dateTime={f.updatedAt}>
                      {new Date(f.updatedAt).toLocaleDateString()}
                    </time>
                  </TableCell>
                  <TableCell className="[&_button]:size-8">
                    <ItemActions
                      id={f.id}
                      label={`feedback from ${f.person} for ${f.title}`}
                      commands={commands}
                      actions={
                        f.contentId && item !== f.contentId
                          ? [
                              {
                                label: "View all feedback for this item",
                                onSelect: () => viewItem(f.contentId!),
                              },
                            ]
                          : []
                      }
                      disabled={
                        !onDeleteFeedback &&
                        (!f.contentId || item === f.contentId)
                      }
                      noun="feedback entries"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </TableContainer>
      )}
      <CollectionEmpty
        count={records.length}
        total={feedbackRows(data, "all", "all", "all", "", "newest").length}
        noun="feedback entries"
        onClear={clearFilters}
      />
    </>
  );
}

function FeedbackComment({
  entry,
}: {
  entry: ReturnType<typeof feedbackRows>[number];
}) {
  const [open, setOpen] = useState(false);
  const comment = entry.comment?.trim();
  const characters = Array.from(comment?.replace(/\s+/g, " ") || "");
  const excerpt =
    characters.slice(0, 80).join("") + (characters.length > 80 ? "…" : "");
  return (
    <div className="flex w-64 items-center gap-2">
      {comment ? (
        <>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {excerpt}
          </span>
          <Dialog open={open} onOpenChange={setOpen}>
            <Tooltip content="View comment">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                onClick={() => setOpen(true)}
                aria-label={`View comment from ${entry.person} for ${entry.title}`}
              >
                <MessageSquare aria-hidden="true" />
              </Button>
            </Tooltip>
            <DialogContent>
              <DialogTitle>Feedback comment</DialogTitle>
              <DialogDescription>
                {entry.title} · {entry.person}
                {entry.version ? ` · v${entry.version}` : ""} ·{" "}
                {new Date(entry.updatedAt).toLocaleDateString()}
              </DialogDescription>
              <Badge variant={entry.rating === "up" ? "success" : "default"}>
                {entry.ratingLabel}
              </Badge>
              <p className="whitespace-pre-wrap text-copy [overflow-wrap:anywhere]">
                {entry.comment}
              </p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Close
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <span className="text-muted-foreground">No comment</span>
      )}
    </div>
  );
}
