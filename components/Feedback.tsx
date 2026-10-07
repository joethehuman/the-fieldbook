"use client";
import { SortPicker } from "./patterns/sort-picker";
import { DetailNavigation } from "./patterns/detail-navigation";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
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
  const records = feedbackRows(data, kind, item, rating, query, sort);
  const ids = records.map((record) => record.id);
  const selection = useBulkSelection(
    JSON.stringify([kind, item, rating, query]),
    ids,
  );
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
  const positive = records.filter((f) => f.rating === "up").length;
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
          ...(query
            ? [
                {
                  id: "query",
                  label: `Search: ${query}`,
                  onRemove: () => setQuery(""),
                },
              ]
            : []),
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
          <SelectField value={item} onValueChange={(value) => setItem(value)}>
            <option value="all">All feedback</option>
            {data.content
              .filter((c) => kind === "all" || c.kind === kind)
              .sort(
                (a, b) =>
                  a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
          </SelectField>
        </FormField>
      </CollectionControls>
      <div className="report-summary">
        <strong>
          {records.length} {records.length === 1 ? "rating" : "ratings"}
        </strong>
        <span>{positive} useful</span>
        <span>{records.length - positive} not useful</span>
        <span>
          {records.length
            ? Math.round((positive / records.length) * 100) + "% positive"
            : "No ratings yet"}
        </span>
      </div>
      {onDeleteFeedback && selection.canSelect && (
        <BulkActions
          selected={selection.selected}
          collectionSize={records.length}
          onSelectionChange={selection.setSelected}
          commands={commands}
          noun="feedback entries"
          summaryControl={
            <SelectRows
              ids={ids}
              value={selection.selected}
              onChange={selection.setSelected}
              label="Select all filtered feedback"
            />
          }
        />
      )}
      <div className="grid gap-4">
        {records.map((f) => (
          <Card asChild className="p-0 sm:p-0" key={f.id}>
            <article>
              <CardContent className="grid gap-4">
                <SectionHeader
                  title={
                    <div className="flex min-w-0 items-center gap-3">
                      {onDeleteFeedback && selection.canSelect && (
                        <Checkbox
                          aria-label={`Select feedback from ${f.person} for ${f.title}`}
                          checked={selection.selected.includes(f.id)}
                          onCheckedChange={(checked) =>
                            selection.toggle(f.id, checked === true)
                          }
                        />
                      )}
                      <h3>{f.title}</h3>
                    </div>
                  }
                >
                  <Badge variant={f.rating === "up" ? "success" : "default"}>
                    {f.ratingLabel}
                  </Badge>
                  {onDeleteFeedback && (
                    <ItemActions
                      id={f.id}
                      label={`feedback from ${f.person} for ${f.title}`}
                      commands={commands}
                      noun="feedback entries"
                    />
                  )}
                </SectionHeader>
                <p className="whitespace-pre-wrap text-copy [overflow-wrap:anywhere]">
                  {f.comment || "No written comment."}
                </p>
              </CardContent>
              <CardFooter>
                <p className="text-copy text-muted-foreground">
                  {f.person} {f.version ? `· v${f.version} ` : ""}·{" "}
                  {new Date(f.updatedAt).toLocaleDateString()}
                </p>
                {f.contentId && item !== f.contentId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => viewItem(f.contentId!)}
                  >
                    View all feedback for this item
                  </Button>
                )}
              </CardFooter>
            </article>
          </Card>
        ))}
      </div>
      <CollectionEmpty
        count={records.length}
        total={feedbackRows(data, "all", "all", "all", "", "newest").length}
        noun="feedback entries"
        onClear={clearFilters}
      />
    </>
  );
}
