"use client";
import { useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { BulkHandler, BulkOperation } from "@/lib/bulk-actions";
import { availableDocSections } from "@/lib/docs-navigation";
import { BulkSelectionBar } from "./patterns/bulk-selection";
import { FormField } from "./patterns/form-field";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/choice";
import { Field } from "./ui/field";
import { Alert } from "./ui/alert";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { useToast } from "./ui/toast";

const labels: Record<BulkOperation, string> = {
  publish: "Publish",
  unpublish: "Unpublish",
  category: "Set category",
  section: "Move to section",
  delete: "Delete",
  restore: "Restore",
};
export function AdminBulkActions({
  data,
  selected,
  onSelectionChange,
  onBulk,
  entity = "content",
  recovery = false,
}: {
  data: Workspace;
  selected: string[];
  onSelectionChange: (ids: string[]) => void;
  onBulk: BulkHandler;
  entity?: "content" | "user";
  recovery?: boolean;
}) {
  const [operation, setOperation] = useState<BulkOperation | null>(null),
    [value, setValue] = useState(""),
    [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false),
    notify = useToast();
  const items = data.content.filter((c) => selected.includes(c.id));
  const sections = availableDocSections(
    data.content.filter((c) => c.kind === "doc"),
    data.settings?.docCategoryOrder,
    data.settings?.docSections,
  );
  const actions: BulkOperation[] = recovery
    ? ["restore"]
    : entity === "user"
      ? ["delete"]
      : [
          "publish",
          "unpublish",
          ...(items.every((c) => c.kind !== "doc")
            ? ["category" as const]
            : []),
          ...(items.every((c) => c.kind === "doc") ? ["section" as const] : []),
          "delete",
        ];
  const names = selected
    .map((id) =>
      recovery
        ? data.deletedItems?.find((d) => d.id === id)?.name
        : entity === "content"
          ? data.content.find((c) => c.id === id)?.title
          : data.users.find((u) => u.id === id)?.name,
    )
    .filter(Boolean);
  return (
    <>
      <BulkSelectionBar
        count={selected.length}
        onClear={() => onSelectionChange([])}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Actions</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {actions.map((action) => (
              <DropdownMenuItem
                key={action}
                onSelect={() => {
                  setOperation(action);
                  setValue("");
                  setAcknowledged(false);
                  setError("");
                }}
              >
                {labels[action]} selected
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </BulkSelectionBar>
      <Dialog
        open={!!operation}
        onOpenChange={(open) => {
          if (!open && !running.current) setOperation(null);
        }}
      >
        {operation && (
          <DialogContent>
            <DialogTitle>
              {labels[operation]} {selected.length}{" "}
              {entity === "user"
                ? selected.length === 1
                  ? "user"
                  : "users"
                : selected.length === 1
                  ? "item"
                  : "items"}
              ?
            </DialogTitle>
            <DialogDescription>
              {operation === "delete"
                ? `You are deleting ${selected.length} ${entity === "user" ? `${selected.length === 1 ? "user" : "users"}. Access ends immediately` : `content ${selected.length === 1 ? "item" : "items"}. Selected content will be unpublished immediately`}. You can restore them in Organization Settings → Recently deleted for 30 days. After 30 days, they and all associated learning history, quiz attempts and feedback will be permanently erased.`
                : operation === "restore"
                  ? "Content returns as draft. Users return as inactive learners; review their access and memberships in People before reactivating them."
                  : operation === "publish"
                    ? "Publish the latest saved drafts, including their unpublished edits. Incomplete items will be skipped with a reason. Update publication dates will move forward. Course versions will not be increased."
                    : operation === "unpublish"
                      ? "Remove these items from the published library. Their drafts and learning history are kept."
                      : "Apply this location to drafts and published copies. Unpublished content edits and learning history are preserved."}
            </DialogDescription>
            <p className="text-copy text-muted-foreground">
              {names.join(", ")}
            </p>
            {error && <Alert variant="destructive">{error}</Alert>}
            {operation === "category" && (
              <FormField label="Category">
                <Input
                  maxLength={80}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </FormField>
            )}
            {operation === "section" && (
              <FormField label="Destination section">
                <SelectField value={value} onValueChange={setValue}>
                  <option value="">Choose a section</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.parentId
                        ? `${sections.find((p) => p.id === s.parentId)?.name} / `
                        : ""}
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </FormField>
            )}
            {operation === "delete" && (
              <Field orientation="horizontal">
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(v === true)}
                />
                I understand that deletion becomes permanent after 30 days and
                erases associated learning history.
              </Field>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setOperation(null)}
              >
                Cancel
              </Button>
              <Button
                variant={operation === "delete" ? "destructive" : "default"}
                loading={busy}
                disabled={
                  !selected.length ||
                  (operation === "delete" && !acknowledged) ||
                  (["category", "section"].includes(operation) && !value.trim())
                }
                onClick={async () => {
                  if (running.current) return;
                  running.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    const results = await onBulk({
                      entity,
                      operation,
                      value,
                      governanceExpected: data.governanceRevision,
                      items: selected.map((id) => ({
                        id,
                        expected: recovery
                          ? data.deletedItems?.find((d) => d.id === id)
                              ?.revision || 0
                          : data.content.find((c) => c.id === id)?.revision ||
                            0,
                      })),
                    });
                    const failed = results.filter((r) => r.status === "failed");
                    const message = `${results.filter((r) => r.status === "changed").length} changed, ${results.filter((r) => r.status === "unchanged").length} already up to date, ${failed.length} failed.`;
                    notify(message);
                    onSelectionChange(failed.map((r) => r.id));
                    if (failed.length)
                      setError(
                        failed
                          .map(
                            (r) =>
                              `${names[selected.indexOf(r.id)] || r.id}: ${r.message}`,
                          )
                          .join(" "),
                      );
                    else setOperation(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    running.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Applying…" : `${labels[operation]} ${selected.length}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
