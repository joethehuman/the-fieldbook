/** Separate list, report and housekeeping reads without caching private data on the server. */
export type AdminScope =
  | "content"
  | "people"
  | "person"
  | "governance"
  | "progress"
  | "feedback"
  | "maintenance";
