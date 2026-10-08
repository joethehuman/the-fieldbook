"use client";
import {
  createContext,
  useContext,
  useRef,
  useState,
  useId,
  useEffect,
} from "react";
import { Alert } from "../ui/alert";
import { Download } from "lucide-react";
import { Button } from "../ui/button";
import { downloadCsv, type CsvReport } from "@/lib/csv";

/** The owner supplies load/mutation failures; this pattern never fetches data. */
export const ReportAvailability = createContext<string | undefined>(undefined);
export function CsvExport({
  report,
  filename,
  disabledReason,
}: {
  report: () => CsvReport | Promise<CsvReport>;
  filename: string;
  disabledReason?: string;
}) {
  const unavailable = useContext(ReportAvailability) || disabledReason;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const latest = useRef({ report, unavailable });
  latest.current = { report, unavailable };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const id = useId();
  async function exportReport() {
    if (locked.current || unavailable) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const selected = report;
    try {
      // Yield to paint the loading state before serializing a larger report.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!mounted.current) return;
      if (latest.current.unavailable || latest.current.report !== selected)
        throw new Error("The report changed. Try exporting again.");
      const prepared = await selected();
      if (
        !mounted.current ||
        latest.current.unavailable ||
        latest.current.report !== selected
      )
        throw new Error("The report changed. Try exporting again.");
      downloadCsv(prepared, filename);
    } catch {
      setError("The CSV couldn’t be prepared. Refresh the report and try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy || !!unavailable}
        aria-busy={busy}
        aria-describedby={unavailable || error ? id : undefined}
        onClick={() => void exportReport()}
      >
        <Download aria-hidden="true" />
        {busy ? "Preparing CSV…" : "Export CSV"}
      </Button>
      {(unavailable || error) && (
        <Alert id={id} variant="destructive" onDismiss={() => setError("")}>
          {unavailable || error}
        </Alert>
      )}
    </div>
  );
}
