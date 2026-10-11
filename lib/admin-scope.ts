/** Separate list, report and housekeeping reads without caching private data on the server. */
export type AdminScope =
  | "content"
  | "categories"
  | "people"
  | "person"
  | "governance"
  | "progress"
  | "feedback"
  | "maintenance";
