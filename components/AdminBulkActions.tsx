"use client";
import type { Workspace } from "@/lib/store";
import type { BulkHandler, BulkOperation } from "@/lib/bulk-actions";
import { availableDocSections } from "@/lib/docs-navigation";
import { BulkActions, type BulkCommand } from "./patterns/bulk-actions";
export function AdminBulkActions({
  data,
  selected,
  onSelectionChange,
  onBulk,
  entity = "content",
  recovery = false,
  extraCommands = [],
}: {
  data: Workspace;
  selected: string[];
  onSelectionChange: (ids: string[]) => void;
  onBulk: BulkHandler;
  entity?: "content" | "user";
  recovery?: boolean;
  extraCommands?: BulkCommand[];
}) {
  const items = data.content.filter((c) => selected.includes(c.id));
  const kind = items[0]?.kind;
  const homogeneous =
    items.length === selected.length &&
    new Set(items.map((c) => c.kind)).size === 1;
  const sections = availableDocSections(
    data.content.filter((c) => c.kind === "doc"),
    data.settings?.docCategoryOrder,
    data.settings?.docSections,
  );
  const categories = [
    ...new Set(
      data.content
        .filter((c) => c.kind === kind)
        .map((c) => c.category.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  function command(
    operation: BulkOperation,
    label: string,
    description: string,
    other: Partial<BulkCommand> = {},
  ): BulkCommand {
    return {
      id: operation,
      label,
      description,
      ...other,
      apply: async (values) => {
        const results = await onBulk({
          entity,
          operation,
          value: values[0],
          governanceExpected: data.governanceRevision,
          items: selected.map((id) => ({
            id,
            expected: recovery
              ? data.deletedItems?.find((d) => d.id === id)?.revision || 0
              : data.content.find((c) => c.id === id)?.revision || 0,
          })),
        });
        const failed = results.filter((r) => r.status === "failed");
        return {
          failed: failed.map((r) => r.id),
          message: `${results.filter((r) => r.status === "changed").length} changed, ${results.filter((r) => r.status === "unchanged").length} already up to date, ${failed.length} failed.`,
          details: failed.map(
            (r) =>
              `${data.content.find((c) => c.id === r.id)?.title || data.users.find((u) => u.id === r.id)?.name || data.deletedItems?.find((d) => d.id === r.id)?.name || r.id}: ${r.message || "Could not apply this change."}`,
          ),
        };
      },
    };
  }
  const commands: BulkCommand[] = recovery
    ? [
        command(
          "restore",
          "Restore selected",
          "Content returns as draft. Users return as inactive learners; review access and memberships before reactivating them.",
        ),
      ]
    : [
        ...(entity === "content"
          ? [
              command(
                "publish",
                "Publish selected",
                "Publish the latest saved drafts, including unpublished edits. Incomplete items are skipped with a reason. Update publication dates move forward; course versions are preserved.",
              ),
              command(
                "unpublish",
                "Unpublish selected",
                "Remove these items from the published library. Drafts and learning history remain.",
              ),
              command(
                kind === "doc" ? "section" : "category",
                kind === "doc" ? "Move to section" : "Set category",
                "Apply this change to drafts and published copies. Other unpublished edits and learning history are preserved.",
                {
                  disabledReason: !homogeneous
                    ? "Select one content type to change its category or section."
                    : undefined,
                  selectionMode: "single",
                  fieldLabel:
                    kind === "doc" ? "Destination section" : "Category",
                  options:
                    kind === "doc"
                      ? sections.map((s) => ({
                          id: s.id,
                          label:
                            (s.parentId
                              ? `${sections.find((p) => p.id === s.parentId)?.name} / `
                              : "") + s.name,
                        }))
                      : categories.map((c) => ({ id: c, label: c })),
                },
              ),
            ]
          : []),
        ...extraCommands,
        command(
          "delete",
          "Delete selected",
          `You are deleting ${entity === "user" ? "users. Access ends immediately" : "content. Selected content is unpublished immediately"}. Restore is available in Organization Settings → Recently deleted for 30 days. After 30 days, these records and associated learning history, quiz attempts and feedback are permanently erased.`,
          {
            destructive: true,
            acknowledgment:
              "I understand that deletion becomes permanent after 30 days and erases associated learning history.",
          },
        ),
      ];
  return (
    <BulkActions
      selected={selected}
      onSelectionChange={onSelectionChange}
      commands={commands}
      noun={entity === "user" ? "users" : "items"}
    />
  );
}
