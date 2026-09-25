"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CurriculumPage } from "@/components/CurriculumPage";
import type { CourseReaderData } from "@/lib/reader-types";
import type { Curriculum } from "@/lib/types";
import type { Progress } from "@/lib/types";

export function ReaderCurriculum({
  curriculum,
  data,
}: {
  curriculum: Curriculum;
  data: CourseReaderData;
}) {
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
  return (
    <CurriculumPage
      curriculum={curriculum}
      courses={data.courses}
      progress={data.user.id === "guest" ? guestProgress : data.progress}
      onBack={() => router.push("/courses")}
      onOpen={(id) =>
        router.push(
          `/courses/${encodeURIComponent(id)}?curriculum=${encodeURIComponent(curriculum.id)}`,
        )
      }
    />
  );
}
