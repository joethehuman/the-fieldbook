"use client";
import Fieldbook from "@/components/Fieldbook";
import { createBrowserClient } from "@supabase/ssr";
import type { FieldbookRuntime } from "@/lib/runtime";
import type { Workspace } from "@/lib/store";
import type { Progress, User } from "@/lib/types";
import { useEffect, useState } from "react";
import {
  guestAnswersForImport,
  type GuestProgress,
} from "@/lib/guest-progress";

const GUEST_KEY = "fieldbook.guest-progress.v1";
async function request(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function readGuest(): Progress[] {
  try {
    const p = JSON.parse(localStorage.getItem(GUEST_KEY) || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}
let currentUser: User | null = null;
const runtime: FieldbookRuntime = {
  async manageLearning(action) {
    await request("/api/assignments", action);
    return (await runtime.load()).data;
  },
  async load() {
    const state = await request("/api/workspace");
    currentUser = state.user;
    if (!currentUser) state.data.progress.guest = readGuest();
    return state;
  },
  async save(before, after) {
    if (JSON.stringify(before.settings) !== JSON.stringify(after.settings))
      await request("/api/settings", {
        settings: after.settings,
        expected: before.revision,
      });
    for (const c of after.content) {
      const old = before.content.find((x) => x.id === c.id);
      if (JSON.stringify(c) !== JSON.stringify(old))
        await request("/api/content", {
          content: c,
          expected: old?.revision || 0,
          publish: c.status === "published",
        });
    }
    for (const c of before.content.filter(
      (c) => !after.content.some((x) => x.id === c.id),
    ))
      await request("/api/content", {
        content: { ...c, status: "draft" },
        expected: c.revision,
        unpublish: true,
      });
    for (const rating of after.feedback || []) {
      if (
        JSON.stringify(rating) !==
        JSON.stringify(before.feedback?.find((x) => x.id === rating.id))
      )
        await request("/api/feedback", rating);
    }
    if (
      JSON.stringify(before.users) !== JSON.stringify(after.users) ||
      JSON.stringify(before.groups) !== JSON.stringify(after.groups) ||
      JSON.stringify(before.teams) !== JSON.stringify(after.teams)
    )
      await request("/api/governance", {
        expected: before.governanceRevision,
        users: after.users,
        groups: after.groups,
        teams: after.teams || [],
      });
    const pendingBefore = before.pendingUsers || [],
      pendingAfter = after.pendingUsers || [];
    const changed = pendingAfter.filter(
      (p) =>
        JSON.stringify(p) !==
        JSON.stringify(pendingBefore.find((x) => x.email === p.email)),
    );
    const removed = pendingBefore.filter(
      (p) => !pendingAfter.some((x) => x.email === p.email),
    );
    if (changed.length + removed.length > 1)
      throw new Error("Save one pending account at a time.");
    for (const p of changed)
      await request("/api/governance", {
        operation: "pending",
        expected: before.governanceRevision,
        ...p,
      });
    for (const p of removed)
      await request("/api/governance", {
        operation: "pending",
        expected: before.governanceRevision,
        ...p,
        revoke: true,
      });
    return (await runtime.load()).data;
  },
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
    window.location.href = `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.hash)}`;
  },
  async signOut() {
    await request("/auth/logout", {});
    window.location.replace("/");
  },
};
export default function ProductionApp() {
  const [importable, setImportable] = useState(false),
    [importing, setImporting] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (readGuest().length)
      request("/api/workspace")
        .then((s) => setImportable(!!s.user))
        .catch(() => {});
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
        <div
          className="guest-import"
          role="region"
          aria-label="Import browser progress"
        >
          <p>Keep the progress you made before signing in?</p>
          <button
            className="primary"
            disabled={importing}
            onClick={importProgress}
          >
            {importing ? "Importing…" : "Save browser progress to my account"}
          </button>
          <button
            className="text-button"
            disabled={importing}
            onClick={() => setImportable(false)}
          >
            Not now
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      <Fieldbook runtime={runtime} />
    </>
  );
}
