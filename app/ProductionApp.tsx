"use client";
import { useEffect, useMemo } from "react";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { createAdminRuntime } from "@/lib/admin-runtime";
import type { AdminDestination } from "@/lib/admin-destination";
import type { Workspace } from "@/lib/store";
import type { User } from "@/lib/types";
import type { ReaderShellContext } from "@/lib/reader-types";
export default function ProductionApp({
  initialAdmin,
}: {
  initialAdmin: {
    data: Workspace;
    user: User;
    shell: ReaderShellContext;
    destination: AdminDestination;
  };
}) {
  const runtime = useMemo(
    () => createAdminRuntime(initialAdmin),
    [initialAdmin],
  );
  useEffect(() => {
    runtime.admin.prefetch();
  }, [runtime]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return <AdminWorkspace initial={initialAdmin} runtime={runtime} />;
}
