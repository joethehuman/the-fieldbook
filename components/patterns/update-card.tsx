import { ArrowRight } from "lucide-react";
import type { Content } from "@/lib/types";
import type { SiteSettings } from "@/lib/settings";
import { updateFeedTimestamp } from "@/lib/learning-groups";
import { CardArtwork } from "./card-artwork";
import { ContentAction } from "./content-action";
import { IntentLink } from "./intent-link";
import { ContentCardFooter } from "./layout";

type UpdateCardItem = Pick<
  Content,
  | "id"
  | "title"
  | "summary"
  | "category"
  | "cardArt"
  | "feedAt"
  | "updatedAt"
  | "createdAt"
>;

function updateDate(item: UpdateCardItem) {
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

/** Shared update presentation with either demo action or reader navigation. */
export function UpdateCard({
  item,
  featured = false,
  href,
  eager = false,
  onClick,
  settings,
}: {
  item: UpdateCardItem;
  featured?: boolean;
  href?: string;
  eager?: boolean;
  onClick?: () => void;
  settings?: SiteSettings;
}) {
  const content = (
    <>
      <CardArtwork
        id={item.id}
        title={item.title}
        kind="brief"
        category={item.category}
        art={item.cardArt}
        settings={settings}
      />
      <div className="brief-copy">
        <span className="eyebrow">{item.category}</span>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <ContentCardFooter
          action={
            <>
              Read the update <ArrowRight size={16} aria-hidden="true" />
            </>
          }
        >
          {updateDate(item)}
        </ContentCardFooter>
      </div>
    </>
  );

  return (
    <ContentAction
      asChild={!!href}
      interaction="lift"
      className={`brief-card ${featured ? "featured" : ""}`}
      onClick={onClick}
    >
      {href ? (
        <IntentLink href={href} eager={eager}>
          {content}
        </IntentLink>
      ) : (
        content
      )}
    </ContentAction>
  );
}
