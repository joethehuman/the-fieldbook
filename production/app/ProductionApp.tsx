"use client";
import { Callout } from "@/components/patterns/layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Fieldbook from "@/components/Fieldbook";
import { createBrowserClient } from "@supabase/ssr";
import type { FieldbookRuntime } from "@/lib/runtime";
import type { Progress, User } from "@/lib/types";
import type { Workspace } from "@/lib/store";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ReadingState } from "@/lib/reading";
import {
  guestAnswersForImport,
  type GuestProgress,
} from "@/lib/guest-progress";

import {
  request,
  createWorkspaceSaver,
  RequestError,
} from "@/lib/workspace-save";

const GUEST_KEY = "fieldbook.guest-progress.v1";
function readGuest(): Progress[] {
  try {
    const p = JSON.parse(localStorage.getItem(GUEST_KEY) || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}
let currentUser: User | null = null;
const saveWorkspace = createWorkspaceSaver(
  request,
  async () => (await runtime.load()).data,
);
const runtime: FieldbookRuntime = {
  async search(query, filter, signal) {
    const response = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&type=${filter}`,
      {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("Search unavailable");
    return response.json();
  },
  async manageLearning(action) {
    await request("/api/assignments", action);
    return (await runtime.load()).data;
  },
  async load() {
    const state = await request("/api/workspace");
    const refreshedUser = state.data.users.find(
      (user: User) => user.id === currentUser?.id,
    );
    if (
      currentUser &&
      (!state.user ||
        state.user.id !== currentUser.id ||
        !refreshedUser?.active ||
        refreshedUser.role !== currentUser.role)
    )
      throw new RequestError(
        "Your sign-in or account access changed. Download your draft before signing in again; the open edits have been kept.",
        401,
      );
    currentUser = state.user;
    if (!currentUser) state.data.progress.guest = readGuest();
    return state;
  },
  save: saveWorkspace,
  refresh: saveWorkspace.refresh,
  async progress(course, current, lessonId, answers) {
    const prior = current.find(
      (p) => p.content_id === course.id && p.version === course.version,
    );
    const r = await request("/api/progress", {
      contentId: course.id,
      version: course.version,
      lessonId,
      answers,
      lessons: currentUser ? undefined : prior?.lessons || [],
    });
    const p: Progress = {
      content_id: course.id,
      version: course.version,
      lessons: r.lessons,
      passed: r.passed || prior?.passed || false,
      attempts: r.attempts || prior?.attempts || [],
    };
    // Retain answers only for guest import; the server re-grades them after sign-in.
    if (!currentUser)
      (p as GuestProgress).guestAnswers = guestAnswersForImport(
        prior,
        answers,
        r.attemptPassed,
      );
    const progress = [
      ...current.filter(
        (x) => !(x.content_id === p.content_id && x.version === p.version),
      ),
      p,
    ];
    if (!currentUser) localStorage.setItem(GUEST_KEY, JSON.stringify(progress));
    return { progress, attemptPassed: r.attemptPassed };
  },
  async upload(file) {
    const sign = await request("/api/upload", {
      name: file.name,
      size: file.size,
      type: file.type,
    });
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const { error } = await supabase.storage
      .from("fieldbook-media")
      .uploadToSignedUrl(sign.path, sign.token, file, {
        contentType: file.type,
        upsert: false,
      });
    if (error)
      throw new Error(
        "Upload failed. Check the file size and your connection.",
      );
    return (await request("/api/upload", { complete: sign.id })).url;
  },
  signIn() {
    window.location.href = `/auth/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`;
  },
  async signOut() {
    await request("/auth/logout", {});
    window.location.replace("/");
  },
};

function createAdminRuntime(initial: {
  data: Workspace;
  user: User;
}): FieldbookRuntime {
  let scope: "content" | "governance" | "feedback" = "content";
  let openItem: string | null = null;
  const cached = new Map<"content" | "governance" | "feedback", Workspace>([
    ["content", initial.data],
  ]);
  async function fresh(): Promise<Workspace> {
    const state = await request(`/api/admin/snapshot?scope=${scope}`);
    if (
      !state.user ||
      state.user.id !== initial.user.id ||
      state.user.role !== "admin"
    )
      throw new RequestError(
        "Administrator access changed. Sign in again.",
        401,
      );
    let data = state.data as Workspace;
    if (openItem && scope === "content") {
      const item = await request(
        `/api/content?id=${encodeURIComponent(openItem)}&draft=true`,
      );
      data = {
        ...data,
        content: data.content.map((entry) =>
          entry.id === openItem ? item : entry,
        ),
      };
    }
    cached.set(scope, data);
    return data;
  }
  const saver = createWorkspaceSaver(request, fresh);
  return {
    ...runtime,
    load: async () => ({ data: await fresh(), user: initial.user }),
    save: async (before, after) => {
      const created = after.content.find(
        (item) => !before.content.some((previous) => previous.id === item.id),
      );
      if (created) openItem = created.id;
      const saved = await saver(before, after);
      cached.clear();
      cached.set(scope, saved);
      return saved;
    },
    refresh: async () => {
      const latest = await saver.refresh();
      cached.clear();
      cached.set(scope, latest);
      return latest;
    },
    manageLearning: async (action) => {
      await request("/api/assignments", action);
      cached.clear();
      return fresh();
    },
    admin: {
      prepare: async (next) => {
        scope = next;
        openItem = null;
        return cached.get(next) || fresh();
      },
      edit: async (id) => {
        const item = await request(
          `/api/content?id=${encodeURIComponent(id)}&draft=true`,
        );
        openItem = id;
        const data = {
          ...(cached.get(scope) || initial.data),
          content: (cached.get(scope) || initial.data).content.map((entry) =>
            entry.id === id ? item : entry,
          ),
        };
        cached.set(scope, data);
        return { data, item };
      },
      unpublish: async (id) => {
        const item = await request(
          `/api/content?id=${encodeURIComponent(id)}&draft=true`,
        );
        await request("/api/content", {
          content: item,
          expected: item.revision,
          unpublish: true,
        });
        openItem = null;
        cached.clear();
        return fresh();
      },
    },
  };
}
export default function ProductionApp({
  initialReading,
  initialAdmin,
  children,
}: {
  initialReading?: ReadingState;
  initialAdmin?: { data: Workspace; user: User };
  children?: ReactNode;
}) {
  const activeRuntime = useMemo(
    () => (initialAdmin ? createAdminRuntime(initialAdmin) : runtime),
    [initialAdmin],
  );
  const [importable, setImportable] = useState(false),
    [importing, setImporting] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  async function importProgress() {
    setImporting(true);
    setError("");
    let saved = 0;
    try {
      for (const p of readGuest()) {
        await request("/api/progress", {
          contentId: p.content_id,
          version: p.version,
          lessons: p.lessons,
          answers: (p as GuestProgress).guestAnswers,
        });
        saved++;
        localStorage.setItem(
          GUEST_KEY,
          JSON.stringify(
            readGuest().filter(
              (x) =>
                !(x.content_id === p.content_id && x.version === p.version),
            ),
          ),
        );
      }
      localStorage.removeItem(GUEST_KEY);
      window.location.reload();
    } catch (e) {
      setError(
        `${saved} course records imported. ${(e as Error).message} Your browser progress is still available.`,
      );
      setImporting(false);
    }
  }
  return (
    <>
      {importable && (
        <Callout
          className="m-4"
          role="region"
          aria-label="Import browser progress"
        >
          <p>Keep the progress you made before signing in?</p>
          <Button
            variant="default"
            disabled={importing}
            onClick={importProgress}
          >
            {importing ? "Importing…" : "Save browser progress to my account"}
          </Button>
          <Button
            variant="link"
            disabled={importing}
            onClick={() => setImportable(false)}
          >
            Not now
          </Button>
          {error && <Alert variant="destructive">{error}</Alert>}
        </Callout>
      )}
      <Fieldbook
        runtime={activeRuntime}
        initialReading={initialReading}
        initialAdmin={initialAdmin}
        onLoaded={(user) => setImportable(!!user && readGuest().length > 0)}
      >
        {children}
      </Fieldbook>
    </>
  );
}
