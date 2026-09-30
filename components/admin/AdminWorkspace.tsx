"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
const Admin = dynamic(() => import("@/components/Admin"));
export function AdminWorkspace({
  initial,
  runtime,
}: {
  initial: { data: Workspace; user: User; shell: ReaderShellContext };
  runtime: AdminRuntime;
}) {
  const [data, setData] = useState(initial.data);
  const user = initial.user;
  const [error, setError] = useState("");
  const [reportIssue, setReportIssue] = useState<string | undefined>();
  const navigationGuard = useRef<NavigationGuard | null>(null);
  const { updateContext, registerNavigationGuard: registerShellGuard } =
    useWorkspaceShell();
  const registerNavigationGuard = useCallback(
    (guard: NavigationGuard | null, options?: { protected: boolean }) => {
      navigationGuard.current = guard;
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
  async function persist(
    next: Workspace,
    options?: { locallyHandled?: boolean },
  ) {
    setError("");
    setReportIssue("Updating report…");
    if (runtime && data) {
      try {
        setData(await runtime.save(data, next));
        setReportIssue(undefined);
        setError("");
      } catch (e) {
        setReportIssue(
          "Reload the report before exporting after a failed change.",
        );
        if (e instanceof SaveRecoveryError && e.snapshot) setData(e.snapshot);
        if (!options?.locallyHandled)
          setError(navigationGuard.current ? "" : (e as Error).message);
        throw e;
      }
      return;
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
          data={data}
          user={user}
          onChange={persist}
          onBulk={async (action) => {
            if (runtime?.admin) {
              const result = await runtime.admin.bulk(action);
              setData(result.data);
              return result.results;
            }
            throw new Error("Administrator runtime unavailable");
          }}
          onOpenTab={
            runtime?.admin
              ? async (next) => {
                  const scope =
                    next === "feedback"
                      ? "feedback"
                      : next === "content" || next.startsWith("settings-")
                        ? "content"
                        : "governance";
                  setData(await runtime.admin!.prepare(scope));
                }
              : undefined
          }
          onEdit={
            runtime?.admin
              ? async (id) => {
                  const result = await runtime.admin!.edit(id);
                  setData(result.data);
                  return result.item;
                }
              : undefined
          }
          onUnpublish={
            runtime?.admin
              ? async (id) => {
                  setData(await runtime.admin!.unpublish(id));
                }
              : undefined
          }
          onLearning={
            runtime
              ? async (action) => {
                  setReportIssue("Updating report…");
                  try {
                    setData(await runtime.manageLearning(action));
                    setReportIssue(undefined);
                  } catch (e) {
                    setReportIssue(
                      "Reload the report before exporting after a failed change.",
                    );
                    throw e;
                  }
                }
              : undefined
          }
          production={!!runtime}
          historyManaged
          onUpload={runtime?.upload}
          registerNavigationGuard={registerNavigationGuard}
          onReload={async () => {
            const latest = runtime
              ? runtime.refresh
                ? await runtime.refresh()
                : (await runtime.load()).data
              : initial.data;
            setData(latest);
            setReportIssue(undefined);
            setError("");
            return latest;
          }}
        />
      </ReportAvailability.Provider>
    </>
  );
}
