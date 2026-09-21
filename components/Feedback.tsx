"use client";
import { CsvExport } from "./patterns/csv-export";
import { feedbackRows, feedbackCsv } from "@/lib/reporting";
import { Input } from "@/components/ui/input";
import {
  FilterBar,
  SectionHeader,
  StatusActions,
  EmptyState,
} from "@/components/patterns/layout";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { ActionGroup } from "@/components/ui/action-group";
import { Alert } from "@/components/ui/alert";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
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
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState(saved?.comment || "");
  async function save(rating: Entry["rating"], text = comment) {
    const next: Entry = {
      id: saved?.id || crypto.randomUUID(),
      userId: user.id,
      contentId: content.id,
      version: content.version,
      rating,
      comment: text.trim(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await onChange({
        ...data,
        feedback: [
          ...(data.feedback || []).filter(
            (f) => !(f.userId === user.id && f.contentId === content.id),
          ),
          next,
        ],
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="feedback-box" aria-label="Content feedback">
      <h3>Did you find this useful?</h3>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
      <p>Your feedback helps us make this better.</p>
      <ActionGroup>
        {(["up", "down"] as const).map((rating) => (
          <Button
            variant={saved?.rating === rating ? "default" : "outline"}
            key={rating}
            aria-label={rating === "up" ? "Useful" : "Not useful"}
            aria-pressed={saved?.rating === rating}
            onClick={() => {
              save(rating);
              setExpanded(true);
            }}
          >
            {rating === "up" ? (
              <ThumbsUp size={17} />
            ) : (
              <ThumbsDown size={17} />
            )}
          </Button>
        ))}
      </ActionGroup>
      {saved && (
        <StatusActions
          actions={
            !expanded && (
              <Button variant="link" onClick={() => setExpanded(true)}>
                Edit comment
              </Button>
            )
          }
        >
          Thanks—your rating is saved.
        </StatusActions>
      )}
      {expanded && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (saved) save(saved.rating);
            setExpanded(false);
          }}
        >
          <Field>
            Tell us more <span className="muted">(optional)</span>
            <Textarea
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What worked? What could be more useful?"
            />
          </Field>
          <ActionGroup>
            <Button variant="default">Save comment</Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setComment(saved?.comment || "");
                setExpanded(false);
              }}
            >
              Done
            </Button>
          </ActionGroup>
        </form>
      )}
    </section>
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
        <Field>
          Search feedback
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Content title or comment"
          />
        </Field>
        <Field>
          Content type
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
        </Field>
        <Field>
          Content item
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
        </Field>
        <Field>
          Rating
          <SelectField
            value={rating}
            onValueChange={(value) => setRating(value)}
          >
            <option value="all">All ratings</option>
            <option value="up">Useful</option>
            <option value="down">Not useful</option>
          </SelectField>
        </Field>
        <Field>
          Sort feedback
          <SelectField value={sort} onValueChange={(value) => setSort(value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </SelectField>
        </Field>
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
