import type { Content } from "./types";
import { demoDocs } from "./demo-fixtures/content/docs";
import { demoCourses } from "./demo-fixtures/content/courses";
import { demoUpdates } from "./demo-fixtures/content/updates";
import { docPlacement } from "./demo-fixtures/content/navigation";
export { DOC_CATEGORY_ORDER } from "./demo-fixtures/content/navigation";

export const seedContent: Content[] = [
  ...demoDocs.map((doc) => ({ ...doc, ...docPlacement(doc.id) })),
  ...demoUpdates,
  ...demoCourses,
];
