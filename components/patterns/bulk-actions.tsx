"use client";
import { useRef, useState, type ReactNode } from "react";
import { BulkSelectionBar } from "./bulk-selection";
import {
  SearchableSelectionList,
  type SelectionOption,
} from "./searchable-selection-list";
import { ActionGroup } from "../ui/action-group";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/choice";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { SelectField } from "../ui/select";
import { FormField } from "./form-field";
import { Alert } from "../ui/alert";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { useToast } from "../ui/toast";
export type BulkCommand = {
  id: string;
  label: string;
  description: string;
  successMessage?: string;
  disabledReason?: string;
  destructive?: boolean;
  acknowledgment?: string;
  options?: SelectionOption[];
  selectionMode?: "single" | "multiple";
  field?: "date";
  fieldLabel?: string;
  review?: (values: string[], sourceIds: string[]) => ReactNode;
  apply: (
    values: string[],
    sourceIds?: string[],
  ) => Promise<void | {
    failed: string[];
    message: string;
    details?: string[];
  }> | void;
};
/** Existing rows -> one menu. Target choices are parameters, never a second row selection. */
export function BulkActions({
  selected,
  collectionSize,
  range,
  singleItemActions = true,
  onSelectionChange,
  commands,
  noun = "items",
  children,
}: {
  selected: string[];
  collectionSize: number;
  range?: string;
  /** Omit the fallback when ordinary row/editor actions already cover this collection. */
  singleItemActions?: boolean;
  onSelectionChange: (ids: string[]) => void;
  commands: BulkCommand[];
  noun?: string;
  children?: ReactNode;
}) {
  const [active, setActive] = useState<{
    command: BulkCommand;
    ids: string[];
  } | null>(null);
  const [values, setValues] = useState<string[]>([]),
    [ack, setAck] = useState(false),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const notify = useToast();
  const [resultNotice, setResultNotice] = useState<{
    message: string;
    details?: string[];
  } | null>(null);
  const command = active?.command;
  const commandLabel = (c: BulkCommand) =>
    collectionSize === 1 ? c.label.replace(/\bselected ?/, "").trim() : c.label;
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={!selected.length}>
          {collectionSize > 1 ? "Bulk actions" : "Actions"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {commands.map((c, i) => (
          <div key={c.id}>
            {c.destructive && !commands[i - 1]?.destructive && i > 0 && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuItem
              disabled={!!c.disabledReason}
              className={
                c.destructive
                  ? "text-destructive focus:text-destructive"
                  : undefined
              }
              onSelect={() => {
                setActive({
                  command: { ...c, label: commandLabel(c) },
                  ids: [...selected],
                });
                setResultNotice(null);
                setValues([]);
                setAck(false);
                setError("");
              }}
            >
              {commandLabel(c)}
            </DropdownMenuItem>
            {c.disabledReason && (
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                {c.disabledReason}
              </p>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <>
      {collectionSize > 1 ? (
        <BulkSelectionBar
          count={selected.length}
          total={collectionSize}
          noun={noun}
          range={range}
          onClear={() => onSelectionChange([])}
        >
          {menu}
        </BulkSelectionBar>
      ) : singleItemActions && collectionSize === 1 && selected.length === 1 ? (
        <ActionGroup>{menu}</ActionGroup>
      ) : null}
      {resultNotice && (
        <Alert variant="destructive">
          <p>{resultNotice.message}</p>
          {resultNotice.details && (
            <ul className="max-h-48 overflow-y-auto">
              {resultNotice.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {children}
      <Dialog
        open={!!active}
        onOpenChange={(open) => {
          if (!open && !running.current) setActive(null);
        }}
      >
        {command && active && (
          <DialogContent>
            <DialogTitle>{command.label}</DialogTitle>
            <DialogDescription>
              {active.ids.length} {noun} selected. {command.description}
            </DialogDescription>
            {error && <Alert variant="destructive">{error}</Alert>}
            {command.options &&
              (command.selectionMode === "single" ? (
                <FormField label={command.fieldLabel || "Destination"}>
                  <SelectField
                    value={values[0] || ""}
                    onValueChange={(v) => setValues([v])}
                  >
                    <option value="">Choose an option</option>
                    {command.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </SelectField>
                </FormField>
              ) : (
                <SearchableSelectionList
                  label={command.fieldLabel || "Choose destinations"}
                  disabled={busy}
                  placeholder="Search destinations"
                  emptyMessage="No matching destinations."
                  options={command.options}
                  value={values}
                  onChange={setValues}
                />
              ))}
            {command.options?.length === 0 && (
              <p>
                No eligible destinations. Create one in its owning screen first.
              </p>
            )}
            {values.some(Boolean) && command.review?.(values, active.ids)}
            {command.field === "date" && (
              <FormField label={command.fieldLabel || "Onboarding start date"}>
                <Input
                  type="date"
                  value={values[0] || ""}
                  onChange={(e) => setValues([e.target.value])}
                />
              </FormField>
            )}
            {command.acknowledgment && (
              <Field orientation="horizontal">
                <Checkbox
                  checked={ack}
                  onCheckedChange={(v) => setAck(v === true)}
                />
                {command.acknowledgment}
              </Field>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setActive(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={command.destructive ? "destructive" : "default"}
                loading={busy}
                disabled={
                  !!error ||
                  (!!command.acknowledgment && !ack) ||
                  (!!(command.options || command.field) &&
                    !values.some(Boolean))
                }
                onClick={async () => {
                  if (running.current) return;
                  running.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    const result = await command.apply(values, active.ids);
                    if (result) {
                      onSelectionChange(result.failed);
                      if (result.failed.length) setResultNotice(result);
                      else notify(result.message);
                    } else {
                      onSelectionChange([]);
                      notify(command.successMessage || "Changes applied.");
                    }
                    setActive(null);
                  } catch (e) {
                    setError(
                      (e as Error).message +
                        " Review the current list before retrying.",
                    );
                  } finally {
                    running.current = false;
                    setBusy(false);
                  }
                }}
              >
                {command.destructive ? command.label : "Apply changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
