import type { EffectiveAssignment } from "@/lib/types";
import type {
  FeedbackReportInput,
  LearningReportInput,
  LearningReportStatus,
} from "@/lib/mcp-report-schema";

export type ReportSource = {
  kind: "group" | "team";
  id: string | null;
  name: string;
};
export type LearningReportProjection = {
  personId: string;
  personName: string;
  teamId: string | null;
  teamName: string;
  groups: { id: string; name: string }[];
  course: {
    id: string;
    title: string;
    category: string;
    version: number;
    lessonIds: string[];
  };
  assignment: EffectiveAssignment | null;
  sources: ReportSource[];
  progress: { lessons: string[]; passed: boolean; attemptCount: number };
  status: LearningReportStatus;
};
export type LearningReportTotals = {
  assigned: {
    total: number;
    complete: number;
    overdue: number;
    not_started: number;
    in_progress: number;
  };
  optional: {
    total: number;
    complete: number;
    not_started: number;
    in_progress: number;
  };
};
export type ReportingScopes = {
  organizationWide: boolean;
  teams: { id: string; name: string; parentId?: string }[];
  groups: { id: string; name: string }[];
  courses: { id: string; title: string; version: number }[];
};
export type FeedbackReportRow = {
  id: string;
  contentId: string | null;
  title: string;
  kind: "doc" | "brief" | "course" | "general" | "removed";
  version: number | null;
  person: string;
  rating: "up" | "down";
  comment: string;
  updatedAt: string;
};
export type ReportPage<T> = {
  rows: T[];
  total: number;
  fingerprint: string;
  hasMore: boolean;
};
export type LearningReportPage = ReportPage<LearningReportProjection> & {
  asOf: string;
  dueDatesEnabled: boolean;
  totals: LearningReportTotals;
};
export interface McpReportingDataStore {
  readMcpReportingScopes(actorId: string): Promise<ReportingScopes>;
  readMcpLearningReport(
    actorId: string,
    input: Omit<LearningReportInput, "cursor">,
    after: { personId: string; courseId: string } | null,
    expectedFingerprint: string | null,
  ): Promise<LearningReportPage>;
  readMcpFeedbackReport(
    actorId: string,
    input: Omit<FeedbackReportInput, "cursor">,
    afterId: string | null,
    expectedFingerprint: string | null,
  ): Promise<ReportPage<FeedbackReportRow>>;
}
