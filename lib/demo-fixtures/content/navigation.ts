import type { DocSection } from "../../docs-navigation";
import { D } from "./shared";

const doc = (id: string) => ({ kind: "doc" as const, id });
const section = (id: string) => ({ kind: "section" as const, id });
export const demoDocSections: DocSection[] = [
  {
    id: "hooli-start",
    name: "Start Here",
    itemOrder: [doc(D.firstWeek), section("hooli-tools"), doc(D.discovery)],
  },
  {
    id: "hooli-tools",
    name: "Getting Set Up",
    parentId: "hooli-start",
    docOrder: [D.systems, D.crm],
  },
  {
    id: "hooli-products",
    name: "Products & Launches",
    itemOrder: [doc(D.availability), section("hooli-messaging"), doc(D.launch)],
  },
  {
    id: "hooli-messaging",
    name: "Product Messaging",
    parentId: "hooli-products",
    docOrder: [D.compression, D.box],
  },
  {
    id: "hooli-selling",
    name: "Selling & Getting Paid",
    itemOrder: [
      section("hooli-deal-desk"),
      doc(D.forecast),
      doc(D.finance),
      doc(D.handoff),
    ],
  },
  {
    id: "hooli-deal-desk",
    name: "Deal Desk",
    parentId: "hooli-selling",
    docOrder: [D.discount, D.fields],
  },
  {
    id: "hooli-competition",
    name: "Competitive Intelligence",
    itemOrder: [
      doc(D.landscape),
      section("hooli-battlecards"),
      doc(D.endframe),
    ],
  },
  {
    id: "hooli-battlecards",
    name: "Battlecards",
    parentId: "hooli-competition",
    docOrder: [D.piedPiper, D.yaoNet],
  },
  {
    id: "hooli-customers",
    name: "Working with Customers",
    docOrder: [D.security, D.data, D.ai],
  },
  {
    id: "hooli-life",
    name: "Life at Hooli",
    itemOrder: [
      doc(D.values),
      section("hooli-leading"),
      doc(D.gut),
      doc(D.executive),
    ],
  },
  {
    id: "hooli-leading",
    name: "Leading at Hooli",
    parentId: "hooli-life",
    docOrder: [D.coaching, D.meetings],
  },
];
export const DOC_CATEGORY_ORDER = demoDocSections
  .filter((s) => !s.parentId)
  .map((s) => s.name);
export function docPlacement(id: string) {
  const section = demoDocSections.find(
    (s) =>
      s.docOrder?.includes(id) ||
      s.itemOrder?.some((item) => item.kind === "doc" && item.id === id),
  );
  if (!section) throw new Error(`Missing demo Docs placement: ${id}`);
  const parent = demoDocSections.find((s) => s.id === section.parentId);
  return {
    sectionId: section.id,
    category: parent?.name || section.name,
    folder: parent ? section.name : "",
  };
}
