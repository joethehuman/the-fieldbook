import { WorkspacePage } from "@/components/reader/WorkspacePage";
import { UpdateCard } from "@/components/patterns/update-card";
import type { SiteSettings } from "@/lib/settings";
import {
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
        <UpdateCard
          key={item.id}
          item={item}
          featured={index === 0}
          href={`/updates/${encodeURIComponent(item.id)}`}
          eager={index === 0}
          settings={settings}
        />
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
