"use client";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { createAdminRuntime, mergeAdminSnapshot } from "@/lib/admin-runtime";
import type { Workspace } from "@/lib/store";
import type { User } from "@/lib/types";
import type { ReaderShellContext } from "@/lib/reader-types";
export default function ProductionApp({
  initialAdmin,
  tab = "content",
}: {
  tab?: string;
  initialAdmin: { data: Workspace; user: User; shell: ReaderShellContext };
}) {
  const [visibility, setVisibility] = useState(0);
  useLayoutEffect(() => () => setVisibility((value) => value + 1), []);
  // Activity may hide this route before its post-save RSC refresh finishes.
  // Reset discarded drafts from the latest confirmed data, not the old payload.
  const [baseline, setBaseline] = useState(() => ({
    source: initialAdmin.data,
    data: initialAdmin.data,
  }));
  if (baseline.source !== initialAdmin.data) {
    setBaseline({
      source: initialAdmin.data,
      data: mergeAdminSnapshot(baseline.data, initialAdmin.data),
    });
  }
  const rememberSnapshot = useCallback((data: Workspace) => {
    setBaseline((current) =>
      current.data === data ? current : { ...current, data },
    );
  }, []);
  // RSC refresh must not replace the active draft/save queue's runtime. In
  // particular, keep its openItem so recovery reads the complete draft.
  const [runtime] = useState(() =>
    createAdminRuntime({
      ...initialAdmin,
      scope:
        tab === "deleted"
          ? "deleted"
          : tab === "feedback"
            ? "feedback"
            : tab === "content" || tab.startsWith("settings-")
              ? "content"
              : "governance",
    }),
  );
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return (
    <AdminWorkspace
      key={visibility}
      initial={{ ...initialAdmin, data: baseline.data }}
      runtime={runtime}
      tab={tab}
      onConfirmedSnapshot={rememberSnapshot}
    />
  );
}
