"use client";
import { DetailNavigation } from "./patterns/detail-navigation";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { useRevealTarget } from "./patterns/use-reveal-target";
import { FormField } from "@/components/patterns/form-field";
import { FilterOptions } from "./patterns/filter-options";
import { ContentFeedback } from "./patterns/content-feedback";
import { CsvExport } from "./patterns/csv-export";
import { feedbackRows, feedbackCsv } from "@/lib/reporting";
import { Input } from "@/components/ui/input";
import {
  FilterBar,
  SectionHeader,
  EmptyState,
} from "@/components/patterns/layout";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { useState } from "react";
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
  const saved = data.feedback?.find(
    (f) => f.userId === user.id && f.contentId === content.id,
  );
  async function save(rating: Entry["rating"], text: string) {
    const next: Entry = {
      id: saved?.id || crypto.randomUUID(),
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
        ...(data.feedback || []).filter(
          (f) => !(f.userId === user.id && f.contentId === content.id),
        ),
        next,
      ],
    });
  }
  return (
    <ContentFeedback
      key={`${content.id}:${user.id}`}
      saved={saved}
      onSave={save}
      expanded={expanded}
    />
  );
}

export function FeedbackAdmin({ data }: { data: Workspace }) {
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
  const records = feedbackRows(data, kind, item, rating, query, sort);
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
        label="Feedback rating"
        variant="underline"
        value={rating}
        onValueChange={setRating}
        options={[
          { value: "all", label: "All ratings" },
          { value: "up", label: "Useful" },
          { value: "down", label: "Not useful" },
        ]}
      />
      <FilterBar search={
        <FormField label="Search feedback" visuallyHiddenLabel>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search feedback by content title or comment"
          />
        </FormField>
      }>
        <FormField label="Content type">
          <SelectField
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setItem("all");
            }}
          >
            <option value="all">All types</option>
            <option value="general">General</option>
            <option value="doc">Docs</option>
            <option value="brief">Updates</option>
            <option value="course">Courses</option>
          </SelectField>
        </FormField>
        <FormField label="Content item">
          <SelectField value={item} onValueChange={(value) => setItem(value)}>
            <option value="all">All feedback</option>
            {data.content
              .filter((c) => kind === "all" || c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
          </SelectField>
        </FormField>
        <FormField label="Sort feedback">
          <SelectField value={sort} onValueChange={(value) => setSort(value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </SelectField>
        </FormField>
      </FilterBar>
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
      <div className="grid gap-4">
        {records.map((f) => (
          <Card asChild className="p-0 sm:p-0" key={f.id}>
            <article>
              <CardContent className="grid gap-4">
                <SectionHeader title={<h3>{f.title}</h3>}>
                  <Badge variant={f.rating === "up" ? "success" : "default"}>
                    {f.ratingLabel}
                  </Badge>
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
      {!records.length && (
        <EmptyState>No feedback matches these filters.</EmptyState>
      )}
    </>
  );
}
