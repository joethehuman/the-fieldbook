import {
  TablePending,
  FormPending,
  contentColumns,
  progressColumns,
} from "../patterns/panel-pending";
import { SectionHeader } from "../patterns/layout";
import { adminSections } from "@/lib/admin-navigation";

// One small content pattern is shared by the server-data and client-code waits.
export function AdminSectionPending({ tab }: { tab: string }) {
  const item = adminSections
    .flatMap((group) => group.items)
    .find((item) => item.id === tab);
  if (!item) return null;
  const tables = {
    content: { layout: "contentSelection", columns: contentColumns },
    people: {
      layout: "peopleSelection",
      columns: ["", "Person", "Role", "Groups", "Status", "Actions"],
    },
    teams: {
      layout: "teams",
      columns: ["Team", "Parent team", "Manager", "Members", "Actions"],
    },
    progress: { layout: "progress", columns: progressColumns },
    deleted: {
      layout: "deleted",
      columns: ["", "Item", "Deleted", "Permanently removed", "Actions"],
    },
  } as const;
  const table = tables[tab as keyof typeof tables];
  const pending = table ? (
    <TablePending
      layout={table.layout}
      columns={[...table.columns]}
      label={`Retrieving ${item.name.toLowerCase()}`}
      summary={tab === "progress"}
    />
  ) : tab.startsWith("settings-") ? (
    <FormPending label={`Retrieving ${item.name.toLowerCase()}`} />
  ) : (
    <p role="status" className="muted min-h-64">
      Retrieving {item.name.toLowerCase()}…
    </p>
  );
  return (
    <>
      {tab !== "content" && (
        <SectionHeader
          variant="page"
          title={<h2>{item.name}</h2>}
          description={item.description}
        />
      )}
      {pending}
    </>
  );
}
