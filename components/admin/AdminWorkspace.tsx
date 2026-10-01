"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Admin from "@/components/Admin";
import type { AdminRuntime } from "@/lib/admin-runtime";
import type { Workspace } from "@/lib/store";
import type { User } from "@/lib/types";
import type { NavigationGuard } from "@/lib/navigation-guard";
import { SaveRecoveryError } from "@/lib/save-recovery";
import { ReportAvailability } from "@/components/patterns/csv-export";
import { Alert } from "@/components/ui/alert";
import { useWorkspaceShell } from "@/components/reader/WorkspaceContext";
import type { ReaderShellContext } from "@/lib/reader-types";
import { brandingFromSettings } from "@/lib/branding";
export function AdminWorkspace({
  initial,
  tab = "content",
  runtime,
  onConfirmedSnapshot,
}: {
  tab?: string;
  initial: { data: Workspace; user: User; shell: ReaderShellContext };
  runtime: AdminRuntime;
  onConfirmedSnapshot: (data: Workspace) => void;
}) {
  const router = useRouter();
  const protectedWork = useRef(false);
  const [data, setData] = useState(initial.data);
  const user = initial.user;
  const [error, setError] = useState("");
  const [reportIssue, setReportIssue] = useState<string | undefined>();
  const acceptSnapshot = useCallback((next: Workspace) => {
    setData(next);
    onConfirmedSnapshot(next);
  }, [onConfirmedSnapshot]);
  const navigationGuard = useRef<NavigationGuard | null>(null);
  const { updateContext, registerNavigationGuard: registerShellGuard, registerContentNavigation } =
    useWorkspaceShell();
  const registerNavigationGuard = useCallback(
    (guard: NavigationGuard | null, options?: { protected: boolean }) => {
      navigationGuard.current = guard;
      protectedWork.current = !!options?.protected;
      registerShellGuard(guard, options);
    },
    [registerShellGuard],
  );
  useEffect(() => {
    updateContext({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        managesTeam:
          initial.shell.user?.managesTeam ||
          (data.teams || []).some((team) => team.managerId === user.id),
      },
      branding: brandingFromSettings(data.settings || {}),
      docs: [],
      docCategoryOrder: [],
      docSections: [],
    });
  }, [data.settings, data.teams, user, initial.shell, updateContext]);
  useEffect(() => {
    const confirmed = runtime.adoptSnapshot(initial.data);
    onConfirmedSnapshot(confirmed);
    if (!protectedWork.current) setData(confirmed);
  }, [initial.data, runtime, onConfirmedSnapshot]);
  async function persist(
    next: Workspace,
    options?: { locallyHandled?: boolean },
  ) {
    setError("");
    setReportIssue("Updating report…");
    try {
      acceptSnapshot(await runtime.save(data, next));
      router.refresh();
      setReportIssue(undefined);
      setError("");
    } catch (e) {
      setReportIssue(
        "Reload the report before exporting after a failed change.",
      );
      if (e instanceof SaveRecoveryError && e.snapshot) acceptSnapshot(e.snapshot);
      if (!options?.locallyHandled)
        setError(navigationGuard.current ? "" : (e as Error).message);
      throw e;
    }
  }
  return (
    <>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
      <ReportAvailability.Provider value={reportIssue}>
        <Admin
          initialTab={tab}
          routeManaged
          data={data}
          user={user}
          onChange={persist}
          onSaveContent={async (content, intent) => {
            try {
              const saved = await runtime.saveContent(content, intent);
              acceptSnapshot(runtime.snapshot());
              router.refresh();
              setReportIssue(undefined);
              return saved;
            } catch (failure) {
              if (failure instanceof SaveRecoveryError && failure.snapshot)
                acceptSnapshot(failure.snapshot);
              setReportIssue(
                "Reload the report before exporting after a failed change.",
              );
              throw failure;
            }
          }}
          onBulk={async (action) => {
            const result = await runtime.admin.bulk(action);
            acceptSnapshot(result.data);
            router.refresh();
            return result.results;
          }}
          onOpenTab={async (next) => {
            const scope =
              next === "deleted" ? "deleted" : next === "feedback"
                ? "feedback"
                : next === "content" || next.startsWith("settings-")
                  ? "content"
                  : "governance";
            acceptSnapshot(await runtime.admin.prepare(scope));
          }}
          onEdit={async (id) => {
            const result = await runtime.admin.edit(id);
            acceptSnapshot(result.data);
            return result.item;
          }}
          onUnpublish={async (id) => {
            acceptSnapshot(await runtime.admin.unpublish(id));
            router.refresh();
          }}
          onLearning={async (action) => {
            setReportIssue("Updating report…");
            try {
              acceptSnapshot(await runtime.manageLearning(action));
              router.refresh();
              setReportIssue(undefined);
            } catch (e) {
              setReportIssue(
                "Reload the report before exporting after a failed change.",
              );
              throw e;
            }
          }}
          production
          onUpload={runtime.upload}
          registerNavigationGuard={registerNavigationGuard}
          registerContentNavigation={registerContentNavigation}
          onReload={async () => {
            const latest = await runtime.refresh();
            acceptSnapshot(latest);
            setReportIssue(undefined);
            setError("");
            return latest;
          }}
        />
      </ReportAvailability.Provider>
    </>
  );
}
