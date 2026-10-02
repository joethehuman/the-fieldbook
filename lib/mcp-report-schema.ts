import { z } from "zod";

const ids = z.array(z.string().min(1).max(200)).max(100).optional();
const page = {
  cursor: z.string().min(1).max(2000).optional(),
  limit: z.number().int().min(1).max(100).default(50),
};

export const learningReportInputSchema = z
  .object({
    teamIds: ids,
    groupIds: ids,
    courseIds: ids,
    assignment: z.enum(["all", "assigned", "optional"]).default("assigned"),
    status: z
      .enum(["all", "not_started", "in_progress", "complete", "overdue"])
      .default("all"),
    ...page,
  })
  .strict();

export const feedbackReportInputSchema = z
  .object({
    kind: z.enum(["all", "doc", "brief", "course", "general"]).default("all"),
    contentId: z.string().min(1).max(200).optional(),
    rating: z.enum(["all", "up", "down"]).default("all"),
    ...page,
  })
  .strict();

export type LearningReportInput = z.output<typeof learningReportInputSchema>;
export type FeedbackReportInput = z.output<typeof feedbackReportInputSchema>;
export type LearningReportStatus = Exclude<
  LearningReportInput["status"],
  "all"
>;
