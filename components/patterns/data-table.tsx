import type { ComponentProps } from "react";
import { Table } from "../ui/table";
import { cn } from "@/lib/utils";

// Column widths are a property of the view, never of the currently filtered rows.
const layouts = {
  progressPeopleNoDates: ["", "w-[28%]", "w-[18%]", "w-28", "w-16"],
  progressPeople: ["", "w-[26%]", "w-[16%]", "w-28", "w-20", "w-16"],
  progressAssignments: ["w-[32%]", "w-[20%]", "w-[16%]", "w-[32%]"],
  contentSelection: [
    "w-12",
    "w-[clamp(16rem,38%,28rem)]",
    "w-28",
    "",
    "w-20",
    "w-16",
  ],
  peopleSelection: ["w-12", "w-[28%]", "w-[24%]", "w-28", "", "w-16"],
  deleted: ["w-12", "w-[30%]", "w-[20%]", "w-[20%]", "", "w-16"],
  progress: ["w-[28%]", "w-[17%]", "w-[17%]", "w-[12%]", "w-[11%]", "w-[15%]"],
  content: ["w-[33%]", "w-[12%]", "w-[15%]", "w-[10%]", "w-[30%]"],
  people: ["w-[26%]", "w-[12%]", "w-[23%]", "w-[11%]", "w-[28%]"],
  learningGroupsSelectable: ["w-12", "", "w-[18%]", "w-[18%]", "w-16"],
  learningGroups: ["w-[64%]", "w-[18%]", "w-[18%]"],
  groupMembersSelectable: ["w-12", "w-[36%]", "w-[25%]", "", "w-16"],
  groupMembers: ["w-[40%]", "w-[25%]", "w-[35%]"],
  groupUpdates: ["w-12", "", "w-[25%]", "w-16"],
  assignmentGroups: ["w-10", "w-[70%]", "w-[20%]"],
  teamDirectory: ["w-12", "", "w-[28%]", "w-24", "w-24", "w-16"],
  teamBranches: ["", "w-[32%]", "w-[20%]", "w-16"],
  teamMembers: ["", "w-[35%]", "w-16"],
  teams: ["w-[24%]", "w-[20%]", "w-[24%]", "w-[16%]", "w-[16%]"],
  assignments: ["w-[27%]", "w-[23%]", "w-[20%]", "w-[30%]"],
  audienceReview: ["w-[44%]", "w-[30%]", "w-[26%]"],
  rosterReviewPeople: ["w-[24%]", "w-[30%]", "w-[24%]", "w-20", "w-14"],
  rosterReviewTeams: ["w-[28%]", "w-[28%]", "w-[22%]", "w-20", "w-14"],
  rosterIssues: ["w-[12%]", "w-[24%]", "w-[64%]"],
  organizationReview: ["w-[23%]", "w-[32%]", "w-[25%]", "w-[20%]"],
  deadlineReview: ["w-[23%]", "w-[37%]", "w-[20%]", "w-[20%]"],
  courses: ["w-[30%]", "w-[24%]", "w-[18%]", "w-[28%]"],
} as const;
export function DataTable({
  layout,
  density = "comfortable",
  className,
  children,
  ...props
}: ComponentProps<typeof Table> & {
  layout: keyof typeof layouts;
  density?: "comfortable" | "compact";
}) {
  return (
    <Table
      data-layout={layout}
      density={density}
      pinActions={[
        "groupUpdates",
        "deleted",
        "groupMembersSelectable",
        "contentSelection",
        "peopleSelection",
        "learningGroupsSelectable",
        "teamDirectory",
        "teamBranches",
        "teamMembers",
        "progressPeople",
        "progressPeopleNoDates",
      ].includes(layout)}
      className={cn(
        "table-fixed [&_td]:[overflow-wrap:anywhere] [&_th]:[overflow-wrap:anywhere]",
        [
          "teamDirectory",
          "contentSelection",
          "peopleSelection",
          "deleted",
          "groupMembersSelectable",
          "learningGroupsSelectable",
        ].includes(layout) &&
          "[&_td:first-child]:text-center [&_th:first-child]:text-center",
        [
          "teamMembers",
          "teamBranches",
          "learningGroups",
          "learningGroupsSelectable",
          "groupMembers",
          "groupMembersSelectable",
          "groupUpdates",
        ].includes(layout)
          ? "min-w-128"
          : [
                "assignmentGroups",
                "audienceReview",
                "rosterReviewPeople",
                "rosterReviewTeams",
                "rosterIssues",
              ].includes(layout)
            ? "min-w-72 [&_td]:px-2 [&_th]:px-2"
            : "min-w-208",
        (layout === "rosterReviewPeople" || layout === "rosterReviewTeams") &&
          "min-w-144",
        density === "compact" &&
          layout.startsWith("roster") &&
          "text-caption [&_td]:px-2 [&_td]:py-2 [&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:py-2",
        className,
      )}
      {...props}
    >
      <colgroup>
        {layouts[layout].map((width, index) => (
          <col key={index} className={width} />
        ))}
      </colgroup>
      {children}
    </Table>
  );
}
