"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  adminScope,
  adminHref,
  resolveAdminDestination,
  type AdminDestination,
} from "@/lib/admin-destination";
import type { AdminRuntime } from "@/lib/admin-runtime";
import type { Workspace } from "@/lib/store";
import type { User } from "@/lib/types";
import type {
  LandingNavigation,
  NavigationGuard,
} from "@/lib/navigation-guard";
import { SaveRecoveryError } from "@/lib/save-recovery";
import { ReportAvailability } from "@/components/patterns/csv-export";
import { Alert } from "@/components/ui/alert";
import { useWorkspaceShell } from "@/components/reader/WorkspaceContext";
import type { ReaderShellContext } from "@/lib/reader-types";
import { brandingFromSettings } from "@/lib/branding";
import { accountMenuLinks } from "@/lib/external-links";
import { mergeSavedContent } from "@/lib/content-save";
const Admin = dynamic(() => import("@/components/Admin"));
export function AdminWorkspace({
  initial,
  runtime,
}: {
  initial: {
    data: Workspace;
    user: User;
    shell: ReaderShellContext;
    destination: AdminDestination;
  };
  runtime: AdminRuntime;
}) {
  const [data, setData] = useState(initial.data);
  const user = initial.user;
  const [error, setError] = useState("");
  const [reportIssue, setReportIssue] = useState<string | undefined>();
  const navigationGuard = useRef<NavigationGuard | null>(null);
  const {
    updateContext,
    beforeLocalNavigation,
    finishLocalNavigation,
    registerNavigationGuard: registerShellGuard,
    registerLandingNavigation: registerShellLanding,
  } = useWorkspaceShell();
  const registerLandingNavigation = useCallback(
    (navigation: LandingNavigation | null) =>
      registerShellLanding("admin", navigation),
    [registerShellLanding],
  );
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
      branding: {
        ...brandingFromSettings(data.settings || {}),
        askAiEnabled: data.settings?.askAi?.enabled === true,
        externalLinks: accountMenuLinks(data.settings?.externalLinks),
      },
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
  }
  return (
    <>
      {error && (
        <Alert variant="destructive" role="alert" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}
      <ReportAvailability.Provider value={reportIssue}>
        <Admin
          data={data}
          initialDestination={initial.destination}
          onWriteDestination={async (destination, replace, name) => {
            if (!(await beforeLocalNavigation())) return false;
            window.history[replace ? "replaceState" : "pushState"](
              null,
              "",
              adminHref(destination, name),
            );
            // Replacement writes canonicalize or restore the current Admin
            // form's URL; only a pushed destination leaves that form behind.
            finishLocalNavigation({ preserveForm: replace });
            return true;
          }}
          onLoadDestination={async (destination) => {
            const scope = adminScope(destination);
            let next = await runtime.admin.prepare(
              scope,
              scope === "person" ? destination.id : undefined,
            );
            if (destination.tab === "content" && destination.id) {
              destination = resolveAdminDestination(destination, next);
              const result = await runtime.admin.edit(destination.id!);
              next = result.data;
            }
            setData(next);
            return next;
          }}
          user={user}
          onChange={persist}
          onDeleteFeedback={async (ids) => {
            setReportIssue("Updating report…");
            try {
              setData(await runtime.deleteFeedback(ids));
              setReportIssue(undefined);
            } catch (failure) {
              if (failure instanceof SaveRecoveryError && failure.snapshot) {
                setData(failure.snapshot);
                setReportIssue(undefined);
              } else setReportIssue("Reload the report before exporting after a failed change.");
              throw failure;
            }
          }}
          onImported={async () => {
            setData(await runtime.refresh());
            setError("");
            setReportIssue(undefined);
          }}
          onSaveDocsNavigation={async (before, settings, moves) => {
            const result = await runtime.saveDocsNavigation(before, settings, moves);
            setData(result.data);
            return result;
          }}
          onSaveCategories={async (before, settings, moves) => {
            const result = await runtime.saveCategories(before, settings, moves);
            setData(result.data);
            return result;
          }}
          onSaveSettings={async (before, settings) => {
            const saved = await runtime.saveSettings(before, settings);
            setData(saved);
            setError("");
            return saved;
          }}
          onSaveContent={async (content, intent, options) => {
            try {
              const saved = await runtime.saveContent(content, intent, options);
              setData((current) => mergeSavedContent(current, saved));
              setReportIssue(undefined);
              return saved;
            } catch (failure) {
              if (failure instanceof SaveRecoveryError && failure.snapshot)
                setData(failure.snapshot);
              setReportIssue(
                "Reload the report before exporting after a failed change.",
              );
              throw failure;
            }
          }}
          onBulk={async (action) => {
            const result = await runtime.admin.bulk(action);
            setData(result.data);
            return result.results;
          }}
          onPrepareAssignments={async () => {
            const next = await runtime.admin.prepareAssignments();
            setData(next);
            return next;
          }}
          onOpenTab={async (next) => {
            const scope =
              next === "progress"
                ? "progress"
                : next === "people" || next === "teams" || next === "curricula"
                  ? "people"
                  : next === "deleted"
                    ? "maintenance"
                    : next === "feedback"
                      ? "feedback"
                      : next === "content" || next.startsWith("settings-")
                        ? "content"
                        : "governance";
            setData(await runtime.admin.prepare(scope));
          }}
          onUnpublish={async (id) => {
            setData(await runtime.admin.unpublish(id));
          }}
          onReviewDeadlines={async (token) => {
            const result = await runtime.reviewDeadlines(token);
            if (token) setData(await runtime.refresh());
            return result;
          }}
          onLearning={async (action) => {
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
          }}
          production
          onUpload={runtime.upload}
          registerNavigationGuard={registerNavigationGuard}
          registerLandingNavigation={registerLandingNavigation}
          onReload={async () => {
            const latest = await runtime.refresh();
            setData(latest);
            setReportIssue(undefined);
            setError("");
            return latest;
          }}
          onLoadPublished={runtime.publishedContent}
        />
      </ReportAvailability.Provider>
    </>
  );
}
