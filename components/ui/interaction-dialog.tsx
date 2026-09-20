"use client";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./button";

type Request = {
  kind: "confirm" | "prompt";
  message: string;
  initial?: string;
};
type Interactions = {
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, initial?: string) => Promise<string | null>;
};
const Context = createContext<Interactions | null>(null);
export function useInteractionDialog() {
  const context = useContext(Context);
  if (!context) throw new Error("InteractionDialogProvider is required");
  return context;
}
export function InteractionDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const resolve = useRef<((value: string | boolean | null) => void) | null>(
    null,
  );
  const returnFocus = useRef<HTMLElement | null>(null);
  const ask = useCallback(
    (next: Request) =>
      new Promise<string | boolean | null>((done) => {
        // Cancel an older outstanding request if a second interaction supersedes it.
        resolve.current?.(null);
        resolve.current = done;
        returnFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setValue(next.initial || "");
        setRequest(next);
      }),
    [],
  );
  const confirm = useCallback(
    async (message: string) =>
      (await ask({ kind: "confirm", message })) === true,
    [ask],
  );
  const prompt = useCallback(
    async (message: string, initial?: string) => {
      const result = await ask({ kind: "prompt", message, initial });
      return typeof result === "string" ? result : null;
    },
    [ask],
  );
  function finish(result: string | boolean | null) {
    setRequest(null);
    resolve.current?.(result);
    resolve.current = null;
  }
  function restoreFocus(event: Event) {
    event.preventDefault();
    returnFocus.current?.focus();
  }
  return (
    <Context.Provider value={{ confirm, prompt }}>
      {children}
      <AlertDialog.Root
        open={request?.kind === "confirm"}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="ui-dialog-overlay ui-interaction-overlay" />
          <AlertDialog.Content
            className="ui-dialog-content ui-interaction-content"
            onCloseAutoFocus={restoreFocus}
          >
            <AlertDialog.Title className="ui-dialog-title">
              Confirm action
            </AlertDialog.Title>
            <AlertDialog.Description className="ui-dialog-description">
              {request?.message}
            </AlertDialog.Description>
            <div className="ui-dialog-actions">
              <AlertDialog.Cancel asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => finish(false)}
                >
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button type="button" onClick={() => finish(true)}>
                  Confirm
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <Dialog.Root
        open={request?.kind === "prompt"}
        onOpenChange={(open) => {
          if (!open) finish(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="ui-dialog-overlay ui-interaction-overlay" />
          <Dialog.Content
            className="ui-dialog-content ui-interaction-content"
            onCloseAutoFocus={restoreFocus}
          >
            <Dialog.Title className="ui-dialog-title">
              Rename group
            </Dialog.Title>
            <Dialog.Description className="ui-dialog-description">
              Choose a clear, unique name for this group.
            </Dialog.Description>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                finish(value.trim());
              }}
            >
              <label>
                {request?.message}
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
              <div className="ui-dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => finish(null)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save name</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Context.Provider>
  );
}
