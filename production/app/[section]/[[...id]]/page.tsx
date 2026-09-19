import { notFound } from "next/navigation";
import ProductionApp from "../../ProductionApp";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string; id?: string[] }>;
}) {
  const { section, id } = await params;
  if (
    !["learning", "knowledge", "notes", "admin"].includes(section) ||
    (id && id.length > 1)
  )
    notFound();
  return <ProductionApp />;
}
