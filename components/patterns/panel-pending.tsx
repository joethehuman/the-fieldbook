import { Skeleton } from "../ui/skeleton";
import { DataTable } from "./data-table";
import {
  TableContainer,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "../ui/table";
import type { ComponentProps } from "react";
export const contentColumns = [
  "",
  "Content",
  "Type",
  "Status",
  "Version",
  "Actions",
];
export const progressColumns = [
  "Team member",
  "Team",
  "Assigned",
  "Completed",
  "Complete",
  "Actions",
];
// Decorative cells match the real column schema. No mock forms, controls or data.
export function TablePending({
  layout,
  columns,
  label,
  summary = false,
}: {
  layout: ComponentProps<typeof DataTable>["layout"];
  columns: string[];
  label: string;
  summary?: boolean;
}) {
  return (
    <div aria-busy="true" className="grid min-h-64 gap-4">
      <span className="sr-only" role="status">
        {label}
      </span>
      {summary && (
        <div className="report-summary" aria-hidden="true">
          <Skeleton animated={false} className="h-4 w-20" />
          <Skeleton animated={false} className="h-4 w-48" />
          <Skeleton animated={false} className="h-4 w-24" />
        </div>
      )}
      <TableContainer>
        <DataTable layout={layout}>
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead key={index}>
                  {column === "Actions" ? (
                    <span className="sr-only">Actions</span>
                  ) : (
                    column
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <TableRow key={row}>
                {columns.map((_, index) => (
                  <TableCell key={index}>
                    <div className="py-2">
                      <Skeleton
                        animated={false}
                        className={index === 0 ? "h-4 w-3/4" : "h-4 w-2/3"}
                      />
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
    </div>
  );
}
export function FormPending({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="grid min-h-64 content-start gap-6">
      <span className="sr-only" role="status">
        {label}
      </span>
      {[0, 1].map((field) => (
        <div key={field} className="grid gap-2" aria-hidden="true">
          <Skeleton animated={false} className="h-4 w-32" />
          <Skeleton animated={false} className="h-10 w-full max-w-sm" />
        </div>
      ))}
    </div>
  );
}
