import Link from "next/link";
import { BookOpen, ChevronRight, ArrowRight } from "lucide-react";
import { docSections } from "@/lib/docs-navigation";
import { readerContext } from "@production/lib/reader";
import { NavigationButton } from "@/components/patterns/navigation-button";
import { PageHeader } from "@/components/patterns/layout";
export async function generateMetadata() {
  const { branding } = await readerContext("/docs");
  return {
    title: `Docs | ${branding.name}`,
    description: `Published reference documents from ${branding.name}.`,
    ...(branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
export default async function Page() {
  const {
    docs,
    docCategoryOrder,
    docSections: configured,
  } = await readerContext("/docs");
  return (
    <>
      <PageHeader>
        <h1>Docs</h1>
      </PageHeader>
      {docs.some((doc) => doc.id === "start") && (
        <Link className="knowledge-feature" href="/docs/start" prefetch={false}>
          <div>
            <h2>Start here</h2>
            <span className="text-link">
              Open guide <ArrowRight size={17} />
            </span>
          </div>
          <BookOpen size={76} strokeWidth={1} />
        </Link>
      )}
      <div className="knowledge-grid">
        {docSections(docs, docCategoryOrder, configured).map((section) => (
          <section className="knowledge-section" key={section.id}>
            <BookOpen size={22} />
            <h2>{section.name}</h2>
            <p>
              {section.docs.length +
                section.folders.reduce(
                  (count, child) => count + child.docs.length,
                  0,
                )}{" "}
              articles
            </p>
            {section.docs.map((doc) => (
              <NavigationButton asChild key={doc.id}>
                <Link
                  href={`/docs/${encodeURIComponent(doc.id)}`}
                  prefetch={false}
                >
                  {doc.title}
                  <ChevronRight size={16} />
                </Link>
              </NavigationButton>
            ))}
            {section.folders.map((child) => (
              <div key={child.id}>
                <h3>{child.name}</h3>
                {child.docs.map((doc) => (
                  <NavigationButton asChild key={doc.id}>
                    <Link
                      href={`/docs/${encodeURIComponent(doc.id)}`}
                      prefetch={false}
                    >
                      {doc.title}
                      <ChevronRight size={16} />
                    </Link>
                  </NavigationButton>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
