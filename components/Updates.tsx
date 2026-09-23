"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ContentAction } from "@/components/patterns/content-action";
import {
  SectionHeader,
  EmptyState,
  ContentCardFooter,
} from "@/components/patterns/layout";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { updateFeedTimestamp, updatesForUser } from "@/lib/learning-groups";
import {
  effectiveGroups,
  type Content,
  type User,
  type Group,
} from "@/lib/types";
import { LoadMore } from "@/components/patterns/load-more";

const PAGE_SIZE = 10;

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
  const paginationKey = JSON.stringify({
    viewer: user.id,
    groups: [...effectiveGroups(user, groups)].sort(),
    updates: [...forYou, ...other].map((item) => [
      item.id,
      item.updatedAt,
      item.createdAt,
      [...item.groups].sort(),
    ]),
  });
  const [pagination, setPagination] = useState({ key: "", count: PAGE_SIZE });
  const pendingScroll = useRef<{
    key: string;
    left: number;
    top: number;
  } | null>(null);
  const visibleCount =
    pagination.key === paginationKey ? pagination.count : PAGE_SIZE;
  const visibleUpdates = other.slice(0, visibleCount);

  useLayoutEffect(() => {
    const pending = pendingScroll.current;
    pendingScroll.current = null;
    if (pending?.key === paginationKey)
      window.scrollTo(pending.left, pending.top);
  }, [paginationKey, visibleCount]);

  function loadMore() {
    pendingScroll.current = {
      key: paginationKey,
      left: window.scrollX,
      top: window.scrollY,
    };
    setPagination((current) => ({
      key: paginationKey,
      count: Math.min(
        (current.key === paginationKey ? current.count : PAGE_SIZE) + PAGE_SIZE,
        other.length,
      ),
    }));
  }

  return (
    <>
      {forYou.length > 0 && (
        <section className="updates-section">
          <SectionHeader
            title={<h2>For you</h2>}
            description={
              guest
                ? "Updates recommended for visitors."
                : "The latest updates for your learning groups."
            }
          />
          <UpdateCards items={forYou} onOpen={onOpen} />
        </section>
      )}
      <section className="updates-section">
        <SectionHeader
          title={<h2>{forYou.length ? "More updates" : "All updates"}</h2>}
        />
        <UpdateCards items={visibleUpdates} onOpen={onOpen} />
        {other.length > 0 && (
          <LoadMore
            shown={visibleUpdates.length}
            total={other.length}
            noun="updates"
            onLoadMore={loadMore}
          />
        )}
        {!other.length && (
          <EmptyState>
            {forYou.length
              ? "No other updates published yet."
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
            <ContentCardFooter
              action={
                <>
                  Read the update <ArrowRight size={16} />
                </>
              }
            >
              {formatUpdateDate(b)}
            </ContentCardFooter>
          </div>
        </ContentAction>
      ))}
    </div>
  );
}

function formatUpdateDate(item: Content) {
  const timestamp = updateFeedTimestamp(item);
  return timestamp === undefined
    ? "Date unavailable"
    : new Date(timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}
