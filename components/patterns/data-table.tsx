import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { cn } from "@/lib/utils";

// Columns share bounded content measures, rather than percentages of the viewport.
const measures = {
  select: "w-6",
  record: "max-w-96",
  text: "max-w-64",
  detail: "max-w-128",
  status: "max-w-48",
  date: "max-w-48",
  count: "max-w-32",
  actions: "max-w-80",
} as const;
type Column = keyof typeof measures;
const layouts = {
  progressPeopleNoDates: ["record", "text", "status", "status", "actions"],
  progressPeople: ["record", "text", "status", "status", "count", "actions"],
  progressAssignments: ["record", "status", "date", "detail"],
  contentSelection: [
    "select",
    "record",
    "status",
    "status",
    "date",
    "date",
    "actions",
  ],
  peopleSelection: ["select", "record", "text", "status", "text", "actions"],
  deleted: ["select", "record", "status", "date", "text", "actions"],
  progress: ["record", "text", "count", "count", "count", "actions"],
  content: ["record", "status", "status", "count", "text"],
  people: ["record", "status", "text", "status", "text"],
  learningGroupsSelectable: ["select", "record", "count", "count", "actions"],
  learningGroups: ["record", "count", "count"],
  groupMembersSelectable: ["select", "record", "text", "text", "actions"],
  groupMembers: ["record", "text", "text"],
  groupUpdates: ["select", "record", "date", "actions"],
  categoryItems: ["select", "record", "status", "actions"],
  assignmentGroups: ["select", "record", "count"],
  teamDirectory: ["select", "record", "text", "count", "count", "actions"],
  teamBranches: ["record", "text", "count", "actions"],
  teamMembers: ["record", "text", "actions"],
  teams: ["record", "text", "text", "count", "count"],
  assignments: ["record", "status", "status", "actions"],
  audienceReview: ["record", "status", "date"],
  rosterReviewPeople: ["record", "text", "text", "status", "actions"],
  rosterReviewTeams: ["record", "text", "text", "status", "actions"],
  rosterIssues: ["count", "text", "detail"],
  organizationReview: ["record", "text", "text", "text"],
  deadlineReview: ["record", "record", "date", "date"],
  courses: ["record", "text", "status", "actions"],
  feedback: ["record", "status", "text", "status", "detail", "date", "actions"],
  feedbackSelection: [
    "select",
    "record",
    "status",
    "text",
    "status",
    "detail",
    "date",
    "actions",
  ],
} as const satisfies Record<string, readonly Column[]>;

// Only structural table primitives are transformed. Event handlers, refs, row keys
// and record state stay with the caller; no DOM measurement or client boundary.
function sizeRows(children: ReactNode, columns: readonly Column[]): ReactNode {
  return Children.map(children, (node) => {
    if (!isValidElement<{ children?: ReactNode }>(node)) return node;
    if (
      node.type === Fragment ||
      node.type === TableHeader ||
      node.type === TableBody
    )
      return cloneElement(node, {}, sizeRows(node.props.children, columns));
    if (node.type !== TableRow) return node;

    const cells = Children.toArray(node.props.children).filter(
      isValidElement,
    ) as ReactElement<ComponentProps<typeof TableCell>>[];
    // Expanded import details span the extra spacing column as well.
    if (cells.length === 1 && cells[0].props.colSpan === columns.length) {
      return cloneElement(
        node,
        {},
        cloneElement(
          cells[0],
          {
            colSpan: columns.length + 1,
          },
          <div className="max-w-256 whitespace-normal [overflow-wrap:anywhere]">
            {cells[0].props.children}
          </div>,
        ),
      );
    }
    const hasActions = columns.at(-1) === "actions";
    const spacerIndex = hasActions ? columns.length - 1 : columns.length;
    const sized: ReactNode[] = cells.map((cell, index) => {
      if (cell.type !== TableCell && cell.type !== TableHead) return cell;
      return cloneElement(
        cell,
        { key: cell.key ?? index, className: cn("w-px", cell.props.className) },
        <div
          data-slot="table-cell-content"
          data-column={columns[index]}
          className={cn(
            "w-max whitespace-normal [overflow-wrap:anywhere]",
            measures[columns[index]],
            cell.props.align === "right" && "ml-auto",
            columns[index] === "select" && "mx-auto",
          )}
        >
          {cell.props.children}
        </div>,
      );
    });
    const Spacer = cells[0]?.type === TableHead ? TableHead : TableCell;
    sized.splice(
      spacerIndex,
      0,
      <Spacer
        key="table-space"
        data-slot="table-space"
        aria-hidden="true"
        role="presentation"
        className="w-full p-0 group-data-[density=compact]/table:p-0"
      />,
    );
    return cloneElement(node, {}, sized);
  });
}

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
  const columns = layouts[layout];
  const hasActions = columns.at(-1) === "actions";
  const spacerIndex = hasActions ? columns.length - 1 : columns.length;
  return (
    <Table
      {...props}
      data-layout={layout}
      data-sizing="content"
      density={density}
      pinActions={hasActions}
      className={cn(
        "table-auto",
        columns[0] === "select" &&
          "[&_td:first-child]:text-center [&_th:first-child]:text-center",
        density === "compact" &&
          layout.startsWith("roster") &&
          "text-caption [&_td]:py-2 [&_th]:py-2",
        className,
      )}
    >
      <colgroup>
        {Array.from({ length: columns.length + 1 }, (_, index) => (
          <col
            key={index}
            className={index === spacerIndex ? "w-auto" : "w-px"}
          />
        ))}
      </colgroup>
      {sizeRows(children, columns)}
    </Table>
  );
}
