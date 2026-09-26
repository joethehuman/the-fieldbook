"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Course } from "@/components/Course";
import { ReaderFeedback } from "./ReaderFeedback";
import {
  guestAnswersForImport,
  guestSelectionsForImport,
  type GuestProgress,
} from "@/lib/guest-progress";
import type { Content, Progress } from "@/lib/types";
import type { QuizAnswers } from "@/lib/course-quiz";
import { safeReturnPath } from "@/lib/return-path";

const guestKey = "fieldbook.guest-progress.v1";

export function ReaderCoursePlayer({
  course,
  lessonId,
  curriculum,
  curriculumTitle,
  from,
  signedIn,
  initialProgress,
}: {
  course: Content;
  lessonId?: string;
  curriculum?: string;
  curriculumTitle?: string;
  from?: string;
  signedIn: boolean;
  initialProgress: Progress[];
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);

  useEffect(() => {
    if (signedIn) return;
    try {
      const saved = JSON.parse(localStorage.getItem(guestKey) || "[]");
      if (Array.isArray(saved)) setProgress(saved);
    } catch {
      setProgress([]);
    }
  }, [signedIn]);

  async function record(lessonId?: string, answers?: QuizAnswers, complete?: boolean) {
    const prior = progress.find(
      (entry) =>
        entry.content_id === course.id && entry.version === course.version,
    );
    if (!signedIn && complete) {
      const saved: GuestProgress = { ...(prior || {
        content_id: course.id, version: course.version, lessons: [], attempts: [],
      }), passed: true };
      const next = [...progress.filter((entry) => entry.content_id !== course.id || entry.version !== course.version), saved];
      setProgress(next);
      localStorage.setItem(guestKey, JSON.stringify(next));
      return undefined;
    }
    const response = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentId: course.id,
        version: course.version,
        lessonId,
        selections: answers,
        complete,
        lessons: signedIn ? undefined : prior?.lessons || [],
      }),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Could not save progress. Try again.");
    const saved: Progress = {
      content_id: course.id,
      version: course.version,
      lessons: result.lessons,
      passed: result.passed || prior?.passed || false,
      attempts: signedIn ? result.attempts || prior?.attempts || [] : [
        ...(prior?.attempts || []), ...(result.attempt ? [result.attempt] : []),
      ],
    };
    if (!signedIn) {
      (saved as GuestProgress).guestAnswers = guestAnswersForImport(
        prior,
        answers?.map((selection) => selection[0]),
        result.attemptPassed,
      );
      (saved as GuestProgress).guestSelections = guestSelectionsForImport(prior as GuestProgress | undefined, answers, result.attemptPassed);
    }
    const next = [
      ...progress.filter(
        (entry) =>
          entry.content_id !== course.id || entry.version !== course.version,
      ),
      saved,
    ];
    setProgress(next);
    if (!signedIn) localStorage.setItem(guestKey, JSON.stringify(next));
    // Refresh prefetched course-list progress without resetting this client step.
    router.refresh();
    return result.attemptPassed as boolean | undefined;
  }

  const back = curriculum
    ? `/curricula/${encodeURIComponent(curriculum)}?from=${encodeURIComponent(safeReturnPath(from))}`
    : "/courses";
  return (
    <Course
      key={`${course.id}:${lessonId}`}
      course={course}
      curriculumTitle={curriculumTitle}
      initialLessonId={lessonId}
      progress={progress}
      onProgress={record}
      onBack={() => router.push(back)}
      backHref={back}
      lessonBaseHref={`/courses/${encodeURIComponent(course.id)}${curriculum ? `?curriculum=${encodeURIComponent(curriculum)}&from=${encodeURIComponent(safeReturnPath(from))}` : ""}`}
      backLabel={curriculum ? "Back to curriculum" : "Back to courses"}
      guest={!signedIn}
      onSignIn={() =>
        router.push(
          `/auth/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        )
      }
      feedback={<ReaderFeedback key={course.id} contentId={course.id} />}
    />
  );
}
