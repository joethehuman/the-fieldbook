import { adminSections } from "@/lib/admin-navigation";
export { default } from "../../default";
// Clear the Docs slot on every real Admin route instead of retaining its page.
export function generateStaticParams() {
  return [
    { section: [] },
    ...adminSections
      .flatMap((group) => group.items)
      .filter((item) => item.id !== "content")
      .map((item) => ({ section: [item.id] })),
  ];
}
