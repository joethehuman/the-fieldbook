import type { ComponentProps } from "react";
import { Table } from "../ui/table";
import { cn } from "@/lib/utils";

// Column widths are a property of the view, never of the currently filtered rows.
const layouts = {
  progress: ["w-[28%]", "w-[17%]", "w-[17%]", "w-[12%]", "w-[11%]", "w-[15%]"],
  content: ["w-[33%]", "w-[12%]", "w-[15%]", "w-[10%]", "w-[30%]"],
  people: ["w-[26%]", "w-[12%]", "w-[23%]", "w-[11%]", "w-[28%]"],
  teams: ["w-[24%]", "w-[20%]", "w-[24%]", "w-[16%]", "w-[16%]"],
  assignments: ["w-[27%]", "w-[23%]", "w-[20%]", "w-[30%]"],
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
        "min-w-208 table-fixed [&_td]:[overflow-wrap:anywhere] [&_th]:[overflow-wrap:anywhere]",
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
