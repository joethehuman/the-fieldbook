import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ContentAction } from "@/components/patterns/content-action";
import {
  ContentCardFooter,
  EmptyState,
  PageHeader,
  SectionHeader,
} from "@/components/patterns/layout";
import { readerContext, type ReaderItem } from "@production/lib/reader";
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
function Cards({ items }: { items: ReaderItem[] }) {
  return (
    <div className="brief-list">
      {items.map((item, index) => (
        <ContentAction
          asChild
          className={`brief-card ${index === 0 ? "featured" : ""}`}
          key={item.id}
        >
          <Link
            href={`/updates/${encodeURIComponent(item.id)}`}
            prefetch={false}
          >
            <div className={`brief-art art-${index % 6}`}>
              <ArrowUpRight size={36} />
            </div>
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
                  item.updatedAt || item.createdAt || "",
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </ContentCardFooter>
            </div>
          </Link>
        </ContentAction>
      ))}
    </div>
  );
}
export default async function Page() {
  const { forYou, otherUpdates } = await readerContext("/updates");
  return (
    <>
      <PageHeader>
        <h1>Updates</h1>
      </PageHeader>
      {!!forYou.length && (
        <section className="updates-section">
          <SectionHeader title={<h2>For you</h2>} />
          <Cards items={forYou} />
        </section>
      )}
      <section className="updates-section">
        <SectionHeader
          title={<h2>{forYou.length ? "More updates" : "All updates"}</h2>}
        />
        <Cards items={otherUpdates} />
        {!otherUpdates.length && (
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
