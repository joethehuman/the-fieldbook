import { CourseVideo } from "@/components/patterns/course-video";
import { SectionHeader, Stack } from "@/components/patterns/layout";

export default function VideoExamplesPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 sm:px-8">
      <SectionHeader
        title="Video player"
        description="Fullscreen controls for uploaded videos and provider embeds."
      />
      <Stack>
        <h2>Embedded video</h2>
        <CourseVideo
          url="https://www.youtube.com/watch?v=V0ec_MtFVwA"
          title="Embedded video example"
        />
      </Stack>
      <Stack>
        <h2>Uploaded video</h2>
        <CourseVideo
          url="https://media.fieldbook.example/lesson.mp4"
          title="Uploaded video example"
        />
      </Stack>
      <Stack>
        <h2>Authoring playback</h2>
        <CourseVideo
          url="https://www.youtube.com/watch?v=V0ec_MtFVwA"
          title="Authoring video example"
          allowFullscreen={false}
        />
      </Stack>
    </main>
  );
}
