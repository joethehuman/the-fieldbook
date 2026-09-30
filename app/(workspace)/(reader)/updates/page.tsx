import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { IntentLink } from "@/components/patterns/intent-link";
import { ArrowRight } from "lucide-react";
import { CardArtwork } from "@/components/patterns/card-artwork";
import type { SiteSettings } from "@/lib/settings";
import { ContentAction } from "@/components/patterns/content-action";
import {
  ContentCardFooter,
  EmptyState,
  PageHeader,
  SectionHeader,
} from "@/components/patterns/layout";
import { readerContext, type ReaderItem } from "@server/reader";
export async function generateMetadata() {
  const { branding } = await readerContext("/updates");
  return {
    title: `Updates | ${branding.name}`,
    description: `Published updates from ${branding.name}.`,
    ...(branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
function Cards({
  items,
  settings,
}: {
  items: ReaderItem[];
  settings: SiteSettings;
}) {
  return (
    <div className="brief-list">
      {items.map((item, index) => (
        <ContentAction
          asChild
          className={`brief-card ${index === 0 ? "featured" : ""}`}
          key={item.id}
        >
          <IntentLink
            href={`/updates/${encodeURIComponent(item.id)}`}
            eager={index === 0}
          >
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
                    Read the update <ArrowRight size={16} />
                  </>
                }
              >
                {new Date(
                  item.feedAt || item.updatedAt || item.createdAt || "",
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </ContentCardFooter>
            </div>
          </IntentLink>
        </ContentAction>
      ))}
    </div>
  );
}
export default async function Page() {
  const { forYou, otherUpdates, settings } = await readerContext("/updates");
  return (
    <WorkspacePage section="/updates">
      <>
        <PageHeader>
          <h1>Updates</h1>
        </PageHeader>
        {!!forYou.length && (
          <section className="updates-section">
            <SectionHeader title={<h2>For you</h2>} />
            <Cards items={forYou} settings={settings} />
          </section>
        )}
        <section className="updates-section">
          <SectionHeader
            title={<h2>{forYou.length ? "More updates" : "All updates"}</h2>}
          />
          <Cards items={otherUpdates} settings={settings} />
          {!otherUpdates.length && (
            <EmptyState>
              {forYou.length
                ? "No other updates published yet."
                : "No updates published yet."}
            </EmptyState>
          )}
        </section>
      </>
    </WorkspacePage>
  );
}
