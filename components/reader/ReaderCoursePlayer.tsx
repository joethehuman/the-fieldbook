"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Course } from "@/components/Course";
import { ReaderFeedback } from "./ReaderFeedback";
import {
  guestAnswersForImport,
  type GuestProgress,
} from "@/lib/guest-progress";
import type { Content, Progress } from "@/lib/types";

const guestKey = "fieldbook.guest-progress.v1";

export function ReaderCoursePlayer({
  course,
  lessonId,
  curriculum,
  signedIn,
  initialProgress,
}: {
  course: Content;
  lessonId: string;
  curriculum?: string;
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

  async function record(lessonId?: string, answers?: number[]) {
    const prior = progress.find(
      (entry) =>
        entry.content_id === course.id && entry.version === course.version,
    );
    const response = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentId: course.id,
        version: course.version,
        lessonId,
        answers,
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
      attempts: result.attempts || prior?.attempts || [],
    };
    if (!signedIn)
      (saved as GuestProgress).guestAnswers = guestAnswersForImport(
        prior,
        answers,
        result.attemptPassed,
      );
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
    ? `/curricula/${encodeURIComponent(curriculum)}`
    : `/courses/${encodeURIComponent(course.id)}`;
  return (
    <Course
      key={`${course.id}:${lessonId}`}
      course={course}
      initialLessonId={lessonId}
      progress={progress}
      onProgress={record}
      onBack={() => router.push(back)}
      backLabel={curriculum ? "Back to curriculum" : "Back to course"}
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
