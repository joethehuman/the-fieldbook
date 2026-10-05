"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { SectionHeader, EmptyState } from "@/components/patterns/layout";
import { UpdateCard } from "@/components/patterns/update-card";
import type { SiteSettings } from "@/lib/settings";
import { updatesForUser } from "@/lib/learning-groups";
import {
  effectiveGroups,
  type Content,
  type User,
  type Group,
  type Team,
} from "@/lib/types";
import { LoadMore } from "@/components/patterns/load-more";

const PAGE_SIZE = 10;

export default function Updates({
  content,
  user,
  groups,
  teams = [],
  onOpen,
  settings,
}: {
  content: Content[];
  user: User;
  groups: Group[];
  teams?: Team[];
  onOpen: (id: string) => void;
  settings?: SiteSettings;
}) {
  const { forYou, other } = updatesForUser(content, user, groups, teams);
  const paginationKey = JSON.stringify({
    viewer: user.id,
    team: user.teamId,
    teams,
    groups: [...effectiveGroups(user, groups)].sort(),
    updates: [...forYou, ...other].map((item) => [
      item.id,
      item.updatedAt,
      item.createdAt,
      [...item.groups].sort(),
      [...(item.updateTeams || [])].sort(),
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
      document
        .getElementById("main-content")
        ?.scrollTo(pending.left, pending.top);
  }, [paginationKey, visibleCount]);

  function loadMore() {
    const contentScroll = document.getElementById("main-content");
    pendingScroll.current = {
      key: paginationKey,
      left: contentScroll?.scrollLeft || 0,
      top: contentScroll?.scrollTop || 0,
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
          <SectionHeader title={<h2>For you</h2>} />
          <UpdateCards items={forYou} onOpen={onOpen} settings={settings} />
        </section>
      )}
      <section className="updates-section">
        <SectionHeader
          title={<h2>{forYou.length ? "More updates" : "All updates"}</h2>}
        />
        <UpdateCards
          items={visibleUpdates}
          onOpen={onOpen}
          settings={settings}
        />
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
  settings,
}: {
  items: Content[];
  onOpen: (id: string) => void;
  settings?: SiteSettings;
}) {
  return (
    <div className="brief-list">
      {items.map((b, i) => (
        <UpdateCard
          key={b.id}
          item={b}
          featured={i === 0}
          onClick={() => onOpen(b.id)}
          settings={settings}
        />
      ))}
    </div>
  );
}
