"use client";
import { isOrganizationChangeCanceled } from "@/lib/organization-change";
import { useRef, useState, type ReactNode } from "react";
import { BulkSelectionBar } from "./bulk-selection";
import {
  SearchableSelectionList,
  type SelectionOption,
} from "./searchable-selection-list";
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
  DialogBody,
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
import { RowActions, type RowAction } from "./row-actions";
export type BulkCommand = {
  id: string;
  label: string;
  itemLabel?: string;
  description: string;
  successMessage?: string;
  applyLabel?: string;
  disabledReason?: string;
  destructive?: boolean;
  acknowledgment?: string;
  options?: SelectionOption[];
  selectionMode?: "single" | "multiple";
  field?: "date";
  fieldLabel?: string;
  /** Parameter-free command whose owner supplies the sole consequence review. */
  externalReview?: boolean;
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
  item,
  onSelectionChange,
  commands,
  noun = "items",
  summaryControl,
  children,
}: {
  selected: string[];
  collectionSize: number;
  range?: string;
  /** Individual entry point using the same commands and consequence reviews. */
  item?: { label: string; actions?: RowAction[]; disabled?: boolean };
  onSelectionChange: (ids: string[]) => void;
  commands: BulkCommand[];
  noun?: string;
  summaryControl?: ReactNode;
  children?: ReactNode;
}) {
  selected = [...new Set(selected)];
  const [active, setActive] = useState<{
    command: BulkCommand;
    ids: string[];
  } | null>(null);
  const [values, setValues] = useState<string[]>([]),
    [ack, setAck] = useState(false),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const notify = useToast();
  const [resultNotice, setResultNotice] = useState<{
    message: string;
    details?: string[];
  } | null>(null);
  const command = active?.command;
  const commandLabel = (c: BulkCommand) =>
    item ? c.itemLabel || c.label.replace(/\bselected ?/, "").trim() : c.label;
  const choose = (c: BulkCommand) => {
    if (!item && new Set(selected).size < 2) return;
    if (c.disabledReason || running.current) return;
    if (c.externalReview && !c.options && !c.field && !c.acknowledgment) {
      void applyExternal(c, [...selected]);
      return;
    }
    setActive({
      command: { ...c, label: commandLabel(c) },
      ids: [...selected],
    });
    setResultNotice(null);
    setValues([]);
    setAck(false);
    setError("");
  };
  const applyExternal = async (command: BulkCommand, ids: string[]) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setResultNotice(null);
    let returnToMenu = false;
    try {
      const result = await command.apply([], ids);
      if (result) {
        onSelectionChange(result.failed);
        if (result.failed.length) setResultNotice(result);
        else notify(result.message);
      } else {
        onSelectionChange([]);
        notify(command.successMessage || "Changes applied.");
      }
    } catch (error) {
      returnToMenu = true;
      if (!isOrganizationChangeCanceled(error))
        setResultNotice({ message: (error as Error).message });
    } finally {
      running.current = false;
      setBusy(false);
      if (returnToMenu)
        requestAnimationFrame(() => menuTrigger.current?.focus());
    }
  };
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={menuTrigger}
          type="button"
          variant="outline"
          disabled={busy || new Set(selected).size < 2}
        >
          Bulk actions
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
              onSelect={() => choose(c)}
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
      {item ? (
        <RowActions
          label={item.label}
          disabled={busy || item.disabled}
          actions={[
            ...(item.actions || []),
            ...commands.map((c, i) => ({
              label: commandLabel(c),
              disabled: !!c.disabledReason,
              disabledReason: c.disabledReason,
              destructive: c.destructive,
              separator:
                (i === 0 && !!item.actions?.length) ||
                (!!c.destructive && !commands[i - 1]?.destructive),
              onSelect: () => choose(c),
            })),
          ]}
        />
      ) : collectionSize > 1 || summaryControl ? (
        <BulkSelectionBar
          count={selected.length}
          total={collectionSize}
          noun={noun}
          range={range}
          summaryControl={summaryControl}
          onClear={() => onSelectionChange([])}
        >
          {collectionSize > 1 && menu}
        </BulkSelectionBar>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-copy text-muted-foreground">
            {range || `${collectionSize} ${noun}`}
          </p>
        </div>
      )}
      {resultNotice && (
        <Alert variant="destructive">
          <p>{resultNotice.message}</p>
          {resultNotice.details && (
            <ul className="max-h-48 overflow-y-auto overscroll-y-contain">
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
          <DialogContent
            size={
              command.options && command.selectionMode !== "single"
                ? "picker"
                : "default"
            }
          >
            <DialogTitle>{command.label}</DialogTitle>
            <DialogDescription>
              {item ? item.label : `${active.ids.length} ${noun} selected`}.{" "}
              {command.description}
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
                <DialogBody className="flex flex-col overflow-y-auto">
                  <SearchableSelectionList
                    bounded="compact"
                    label={command.fieldLabel || "Choose destinations"}
                    disabled={busy}
                    placeholder="Search destinations"
                    emptyMessage="No matching destinations."
                    options={command.options}
                    value={values}
                    onChange={setValues}
                  />
                </DialogBody>
              ))}
            {command.options?.length === 0 && (
              <p>
                No eligible destinations. Create one in its owning screen first.
              </p>
            )}
            {(values.some(Boolean) || (!command.options && !command.field)) &&
              command.review?.(values, active.ids)}
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
                    if (!isOrganizationChangeCanceled(e))
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
                {command.applyLabel ||
                  (command.destructive ? command.label : "Apply changes")}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

/** Individual menu; collection selection never determines this record target. */
export function ItemActions({
  id,
  label,
  commands,
  actions,
  disabled,
  noun = "items",
  onSelectionChange = () => {},
}: {
  id: string;
  label: string;
  commands: BulkCommand[];
  actions?: RowAction[];
  disabled?: boolean;
  noun?: string;
  onSelectionChange?: (ids: string[]) => void;
}) {
  return (
    <BulkActions
      selected={[id]}
      collectionSize={1}
      onSelectionChange={onSelectionChange}
      commands={commands}
      noun={noun}
      item={{ label, actions, disabled }}
    />
  );
}
