import type { ComponentProps } from "react";
import { Table } from "../ui/table";
import { cn } from "@/lib/utils";

// Column widths are a property of the view, never of the currently filtered rows.
const layouts = {
  contentSelection: [
    "w-12",
    "w-[30%]",
    "w-[10%]",
    "w-[18%]",
    "w-[10%]",
    "w-[26%]",
  ],
  peopleSelection: [
    "w-12",
    "w-[24%]",
    "w-[12%]",
    "w-[22%]",
    "w-[10%]",
    "w-[26%]",
  ],
  deleted: ["w-12", "w-[30%]", "w-[20%]", "w-[20%]", "w-[24%]"],
  progress: ["w-[28%]", "w-[17%]", "w-[17%]", "w-[12%]", "w-[11%]", "w-[15%]"],
  content: ["w-[33%]", "w-[12%]", "w-[15%]", "w-[10%]", "w-[30%]"],
  people: ["w-[26%]", "w-[12%]", "w-[23%]", "w-[11%]", "w-[28%]"],
  teamMembers: ["w-[45%]", "w-[30%]", "w-[25%]"],
  teams: ["w-[24%]", "w-[20%]", "w-[24%]", "w-[16%]", "w-[16%]"],
  assignments: ["w-[27%]", "w-[23%]", "w-[20%]", "w-[30%]"],
  organizationReview: ["w-[23%]", "w-[32%]", "w-[25%]", "w-[20%]"],
  deadlineReview: ["w-[23%]", "w-[37%]", "w-[20%]", "w-[20%]"],
  courses: ["w-[30%]", "w-[24%]", "w-[18%]", "w-[28%]"],
} as const;
export function DataTable({
  layout,
  className,
  children,
  ...props
}: ComponentProps<typeof Table> & { layout: keyof typeof layouts }) {
  return (
    <Table
      data-layout={layout}
      className={cn(
        "table-fixed [&_td]:[overflow-wrap:anywhere] [&_th]:[overflow-wrap:anywhere]",
        ["contentSelection", "peopleSelection", "deleted"].includes(layout) &&
          "[&_td:first-child]:text-center [&_th:first-child]:text-center",
        layout === "teamMembers" ? "min-w-128" : "min-w-208",
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
