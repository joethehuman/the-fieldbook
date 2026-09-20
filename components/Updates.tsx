"use client";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { updatesForUser } from "@/lib/learning-groups";
import type { Content, User, Group } from "@/lib/types";
export default function Updates({
  content,
  user,
  groups,
  onOpen,
  guest,
}: {
  content: Content[];
  user: User;
  groups: Group[];
  onOpen: (id: string) => void;
  guest: boolean;
}) {
  const { forYou, other } = updatesForUser(content, user, groups);
  return (
    <>
      {!guest && (
        <section className="updates-section">
          <div className="section-heading">
            <div>
              <h2>For you</h2>
              <p>The latest updates for your learning groups.</p>
            </div>
          </div>
          {forYou.length ? (
            <UpdateCards items={forYou} onOpen={onOpen} />
          ) : (
            <p className="empty">
              No updates for your groups yet. Explore all updates below.
            </p>
          )}
        </section>
      )}
      <section className="updates-section">
        <div className="section-heading">
          <h2>{forYou.length ? "Other updates" : "All updates"}</h2>
        </div>
        <UpdateCards items={other} onOpen={onOpen} />
        {!other.length && (
          <p className="empty">
            {forYou.length
              ? "You’ve reached the rest of the updates."
              : "No updates published yet."}
          </p>
        )}
      </section>
    </>
  );
}
function UpdateCards({
  items,
  onOpen,
}: {
  items: Content[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="brief-list">
      {items.map((b, i) => (
        <button
          className={"brief-card " + (i === 0 ? "featured" : "")}
          key={b.id}
          onClick={() => onOpen(b.id)}
        >
          <div className={"brief-art art-" + (i % 6)}>
            <span>UPDATES</span>
            <ArrowUpRight size={36} />
          </div>
          <div className="brief-copy">
            <span className="eyebrow">{b.category}</span>
            <h3>{b.title}</h3>
            <p>{b.summary}</p>
            <span className="brief-date">
              {new Date(b.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
              <span>
                Read the update <ArrowRight size={16} />
              </span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
