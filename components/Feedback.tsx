"use client";
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
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p>Your feedback helps us make this better.</p>
      <div className="button-group">
        {(["up", "down"] as const).map((rating) => (
          <button
            key={rating}
            className={saved?.rating === rating ? "primary" : "secondary"}
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
          </button>
        ))}
      </div>
      {saved && (
        <p role="status">
          Thanks—your rating is saved.
          {!expanded && (
            <button className="text-button" onClick={() => setExpanded(true)}>
              Edit comment
            </button>
          )}
        </p>
      )}
      {expanded && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (saved) save(saved.rating);
            setExpanded(false);
          }}
        >
          <label>
            Tell us more <span className="muted">(optional)</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What worked? What could be more useful?"
            />
          </label>
          <div className="button-group">
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
          </div>
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
  const records = (data.feedback || [])
    .filter((f) => {
      const c = data.content.find((c) => c.id === f.contentId);
      return (
        (kind === "all" || c?.kind === kind) &&
        (item === "all" || f.contentId === item) &&
        (rating === "all" || f.rating === rating) &&
        `${c?.title || ""} ${f.comment}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "newest"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.updatedAt.localeCompare(b.updatedAt),
    );
  const positive = records.filter((f) => f.rating === "up").length;
  return (
    <>
      <div className="filter-bar">
        <label>
          Search feedback
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Content title or comment"
          />
        </label>
        <label>
          Content type
          <SelectField
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setItem("all");
            }}
          >
            <option value="all">All types</option>
            <option value="doc">Knowledge</option>
            <option value="brief">Field notes</option>
            <option value="course">Learning</option>
          </SelectField>
        </label>
        <label>
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
        </label>
        <label>
          Rating
          <SelectField
            value={rating}
            onValueChange={(value) => setRating(value)}
          >
            <option value="all">All ratings</option>
            <option value="up">Useful</option>
            <option value="down">Not useful</option>
          </SelectField>
        </label>
        <label>
          Sort feedback
          <SelectField value={sort} onValueChange={(value) => setSort(value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </SelectField>
        </label>
      </div>
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
            <div className="section-heading">
              <h3>
                {data.content.find((c) => c.id === f.contentId)?.title ||
                  "Removed content"}
              </h3>
              <span>{f.rating === "up" ? "👍 Useful" : "👎 Not useful"}</span>
            </div>
            <small>
              {data.users.find((u) => u.id === f.userId)?.name || "Former user"}{" "}
              · v{f.version} · {new Date(f.updatedAt).toLocaleDateString()}
            </small>
            <p className="feedback-comment">
              {f.comment || "No written comment."}
            </p>
            <button
              className="text-button"
              onClick={() => setItem(f.contentId)}
            >
              View all feedback for this item
            </button>
          </article>
        ))}
      </div>
      {!records.length && (
        <div className="empty">No feedback matches these filters.</div>
      )}
    </>
  );
}
