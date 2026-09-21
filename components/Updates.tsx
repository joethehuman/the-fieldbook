"use client";
import { ContentAction } from "@/components/patterns/content-action";
import {
  SectionHeader,
  EmptyState,
  CardFooter,
} from "@/components/patterns/layout";
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
      {
        <section className="updates-section">
          <SectionHeader
            title={<h2>For you</h2>}
            description={
              guest
                ? "Updates recommended for visitors."
                : "The latest updates for your learning groups."
            }
          ></SectionHeader>
          {forYou.length ? (
            <UpdateCards items={forYou} onOpen={onOpen} />
          ) : (
            <EmptyState>
              {guest
                ? "No guest recommendations yet. Explore all updates below."
                : "No updates for your groups yet. Explore all updates below."}
            </EmptyState>
          )}
        </section>
      }
      <section className="updates-section">
        <SectionHeader
          title={<h2>{forYou.length ? "Other updates" : "All updates"}</h2>}
        ></SectionHeader>
        <UpdateCards items={other} onOpen={onOpen} />
        {!other.length && (
          <EmptyState>
            {forYou.length
              ? "You’ve reached the rest of the updates."
              : "No updates published yet."}
          </EmptyState>
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
        <ContentAction
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
            <CardFooter
              action={
                <>
                  Read the update <ArrowRight size={16} />
                </>
              }
            >
              {new Date(b.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </CardFooter>
          </div>
        </ContentAction>
      ))}
    </div>
  );
}
