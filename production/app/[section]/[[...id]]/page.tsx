import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { reading, readingMetadata } from "@production/lib/reading";
import {
  Article,
  CourseOverview,
  ReadingBack,
} from "@/components/patterns/reading";
import ProductionApp from "../../ProductionApp";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ section: string; id?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
async function resolve({ params, searchParams }: Props) {
  const { section, id } = await params;
  if (id && id.length > 1) notFound();
  const query = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "_rsc") continue;
    for (const entry of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      search.append(key, entry);
  }
  const destination = `/${section}${id ? `/${encodeURIComponent(id[0])}` : ""}${search.size ? `?${search}` : ""}`;
  const result = await reading(section, id?.[0], destination);
  const lesson = typeof query.lesson === "string" ? query.lesson : undefined;
  if (
    result &&
    lesson &&
    (result.item.kind !== "course" ||
      !result.item.lessons.some((l) => l.id === lesson))
  )
    notFound();
  return {
    result,
    lesson,
    curriculum:
      typeof query.curriculum === "string" ? query.curriculum : undefined,
  };
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { result } = await resolve(props);
  return result
    ? readingMetadata(result)
    : { title: "Fieldbook", description: "Docs, updates, and courses." };
}
export default async function Page(props: Props) {
  const { result, lesson, curriculum } = await resolve(props);
  if (!result) return <ProductionApp />;
  const { item, branding, data, section } = result;
  return (
    <ProductionApp
      initialReading={{ data, section, id: item.id, lesson, curriculum }}
    >
      {item.kind === "course" ? (
        <CourseOverview
          curriculum={curriculum}
          item={item}
          back={<ReadingBack kind={item.kind} curriculum={curriculum} />}
        />
      ) : (
        <Article
          item={item}
          name={branding.name}
          back={<ReadingBack kind={item.kind} />}
        />
      )}
    </ProductionApp>
  );
}
