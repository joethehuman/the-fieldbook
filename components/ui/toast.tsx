"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastContext = createContext<((message: string) => void) | null>(null);

/** Confirm completed actions. Errors and required next steps belong inline. */
export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("ToastProvider is required");
  return notify;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);
  const sequence = useRef(0);
  const notify = useCallback((message: string) => {
    setFading(false);
    setToast({ id: ++sequence.current, message });
  }, []);

  useEffect(() => {
    if (!toast || paused) return;
    const fade = window.setTimeout(() => setFading(true), 4000);
    const remove = window.setTimeout(() => setToast(null), 4200);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, [toast, paused]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-70 flex justify-end"
      >
        {toast && (
          <div
            data-slot="toast"
            onMouseEnter={() => {
              setPaused(true);
              setFading(false);
            }}
            onMouseLeave={() => setPaused(false)}
            className={cn(
              "pointer-events-auto flex w-fit max-w-sm items-start gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground shadow-lg transition-opacity duration-200 motion-reduce:transition-none",
              fading ? "opacity-0" : "opacity-100",
            )}
          >
            <Check
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-success"
            />
            <span key={toast.id} className="min-w-0 break-words">
              {toast.message}
            </span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
