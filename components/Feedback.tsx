"use client";
import { FormField } from "@/components/patterns/form-field";
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
}: {
  content: Content;
  user: User;
  data: Workspace;
  onChange: (d: Workspace) => void | Promise<void>;
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
    />
  );
}

export function FeedbackAdmin({ data }: { data: Workspace }) {
  const [kind, setKind] = useState("all"),
    [item, setItem] = useState("all"),
    [rating, setRating] = useState("all"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("newest");
  const records = feedbackRows(data, kind, item, rating, query, sort);
  const positive = records.filter((f) => f.rating === "up").length;
  return (
    <>
      <SectionHeader
        title={<h2>Feedback</h2>}
        description="See what readers and learners are telling you."
      >
        <CsvExport filename="feedback" report={() => feedbackCsv(records)} />
      </SectionHeader>
      <FilterBar>
        <FormField label="Search feedback">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Content title or comment"
          />
        </FormField>
        <FormField label="Content type">
          <SelectField
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setItem("all");
            }}
          >
            <option value="all">All types</option>
            <option value="doc">Docs</option>
            <option value="brief">Updates</option>
            <option value="course">Courses</option>
          </SelectField>
        </FormField>
        <FormField label="Content item">
          <SelectField value={item} onValueChange={(value) => setItem(value)}>
            <option value="all">All content</option>
            {data.content
              .filter((c) => kind === "all" || c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
          </SelectField>
        </FormField>
        <FormField label="Rating">
          <SelectField
            value={rating}
            onValueChange={(value) => setRating(value)}
          >
            <option value="all">All ratings</option>
            <option value="up">Useful</option>
            <option value="down">Not useful</option>
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
        <strong>{records.length} ratings</strong>
        <span>{positive} useful</span>
        <span>{records.length - positive} not useful</span>
        <span>
          {records.length
            ? Math.round((positive / records.length) * 100) + "% positive"
            : "No ratings yet"}
        </span>
      </div>
      <div className="feedback-list">
        {records.map((f) => (
          <article className="feedback-box" key={f.id}>
            <SectionHeader title={<h3>{f.title}</h3>}>
              <span>{f.ratingLabel}</span>
            </SectionHeader>
            <small>
              {f.person} · v{f.version} ·{" "}
              {new Date(f.updatedAt).toLocaleDateString()}
            </small>
            <p className="feedback-comment">
              {f.comment || "No written comment."}
            </p>
            <Button variant="link" onClick={() => setItem(f.contentId)}>
              View all feedback for this item
            </Button>
          </article>
        ))}
      </div>
      {!records.length && (
        <EmptyState>No feedback matches these filters.</EmptyState>
      )}
    </>
  );
}
