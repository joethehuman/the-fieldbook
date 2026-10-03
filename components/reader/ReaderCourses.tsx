"use client";

import { courseLibraryView, courseViewPaths, type LearningView } from "@/lib/course-destination";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Learning from "@/components/Learning";
import type { CourseReaderData } from "@/lib/reader-types";
import type { Progress } from "@/lib/types";
import { assignedCourses } from "@/lib/types";

export function ReaderCourses({ data, initialView = "home" }: { data: CourseReaderData; initialView?: LearningView }) {
  const view = courseLibraryView(usePathname()) || initialView;
  const router = useRouter();
  const [guestProgress, setGuestProgress] = useState<Progress[]>([]);
  useEffect(() => {
    if (data.user.id !== "guest") return;
    try {
      const saved = JSON.parse(
        localStorage.getItem("fieldbook.guest-progress.v1") || "[]",
      );
      if (Array.isArray(saved)) setGuestProgress(saved);
    } catch {
      setGuestProgress([]);
    }
  }, [data.user.id]);
  useEffect(() => {
    // Warm only the most likely course destinations, keeping the catalog cheap.
    const suggested = assignedCourses(data.courses, data.user, data.groups)[0];
    const ids = new Set([suggested?.id, data.courses[0]?.id]);
    for (const id of ids)
      if (id) router.prefetch(`/courses/${encodeURIComponent(id)}`);
  }, [data.courses, data.groups, data.user, router]);
  return (
    <Learning
      view={view}
      onViewChange={(next) => { window.history.pushState(null, "", courseViewPaths[next]); }}
      courses={data.courses}
      curricula={data.curricula}
      settings={data.settings}
      user={data.user}
      groups={data.groups}
      assigned={assignedCourses(data.courses, data.user, data.groups)}
      progress={data.user.id === "guest" ? guestProgress : data.progress}
      guest={data.user.id === "guest"}
      linkedNavigation
      onOpen={(id) => router.push(`/courses/${encodeURIComponent(id)}?from=${encodeURIComponent(courseViewPaths[view])}`)}
      onCurriculum={(id) => router.push(`/curricula/${encodeURIComponent(id)}?from=${encodeURIComponent(courseViewPaths[view])}`)}
    />
  );
}
