import type { Content } from "../../lib/types";

// Public trailers linked by the fictional demo only. Stable assignments keep
// a course's opening video consistent across resets and browser sessions.
const trailers = [
  "https://www.youtube.com/watch?v=qYHp-5h1y5o", // Season 6, 2:08
  "https://www.youtube.com/watch?v=8Be_mmv534U", // Season 4, 2:03
  "https://www.youtube.com/watch?v=wmm7kwUMW18", // Season 5, 1:59
] as const;

function trailerFor(courseId: string) {
  let hash = 2166136261;
  for (const character of courseId)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return trailers[(hash >>> 0) % trailers.length];
}

/** Add an opening video without removing the lesson's existing media or text. */
export function withCourseOpeningVideo(course: Content): Content {
  if (course.kind !== "course" || !course.lessons.length) return course;
  const [first, ...remaining] = course.lessons;
  const videoUrl = trailerFor(course.id);
  if (first.videoUrl === videoUrl) return course;
  return {
    ...course,
    lessons: [
      {
        ...first,
        videoUrl,
        body: first.videoUrl
          ? `[Video](${first.videoUrl})\n\n${first.body}`
          : first.body,
      },
      ...remaining,
    ],
  };
}
