"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CurriculumPage } from "@/components/CurriculumPage";
import type { CourseReaderData } from "@/lib/reader-types";
import type { Curriculum } from "@/lib/types";
import type { Progress } from "@/lib/types";
import { safeReturnPath } from "@/lib/return-path";

export function ReaderCurriculum({
  curriculum,
  data,
  from,
}: {
  curriculum: Curriculum;
  data: CourseReaderData;
  from?: string;
}) {
  const router = useRouter();
  const back = safeReturnPath(from);
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
  return (
    <CurriculumPage
      curriculum={curriculum}
      courses={data.courses}
      progress={data.user.id === "guest" ? guestProgress : data.progress}
      onBack={() => router.push(back)}
      backHref={back}
      backLabel={back === "/courses" ? "Back to courses" : "Back"}
      onOpen={(id) =>
        router.push(
          `/courses/${encodeURIComponent(id)}?curriculum=${encodeURIComponent(curriculum.id)}&from=${encodeURIComponent(back)}`,
        )
      }
      courseHref={(id) => `/courses/${encodeURIComponent(id)}?curriculum=${encodeURIComponent(curriculum.id)}&from=${encodeURIComponent(back)}`}
    />
  );
}
