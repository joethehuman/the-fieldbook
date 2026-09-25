"use client";
import { useState, type ReactNode } from "react";
import { ArrowRight, Check, CheckCircle2, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert } from "./ui/alert";
import { Note } from "./ui/note";
import { Card } from "./ui/card";
import { Progress } from "./ui/progress";
import { Radio } from "./ui/choice";
import { Field, FieldGroup } from "./ui/field";
import { ActionGroup } from "./ui/action-group";
import { NavigationButton } from "./patterns/navigation-button";
import ReactMarkdown from "./Markdown";
import { videoSource } from "@/lib/video";
import {
  isComplete,
  type Content,
  type Progress as CourseProgress,
} from "@/lib/types";

export function Course({
  course: c,
  progress,
  onBack,
  backLabel,
  onProgress,
  onDemoProgress,
  guest = false,
  onSignIn,
  feedback,
  initialLessonId,
}: {
  onProgress?: (
    lessonId?: string,
    answers?: number[],
  ) => Promise<boolean | undefined>;
  onDemoProgress?: (
    lessonId?: string,
    answers?: number[],
  ) => boolean | undefined;
  course: Content;
  progress: CourseProgress[];
  onBack: () => void;
  backLabel: string;
  guest?: boolean;
  onSignIn?: () => void;
  feedback?: ReactNode;
  initialLessonId?: string;
}) {
  const [step, setStep] = useState(() =>
      Math.max(
        0,
        c.lessons.findIndex((l) => l.id === initialLessonId),
      ),
    ),
    [answers, setAnswers] = useState<number[]>([]),
    [result, setResult] = useState<string | null>(null),
    [resultPassed, setResultPassed] = useState(false),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState("");
  const p = progress.find(
    (p) => p.content_id === c.id && p.version === c.version,
  );
  const lesson = c.lessons[step];
  const video = lesson?.videoUrl ? videoSource(lesson.videoUrl) : null;
  const allDone = c.lessons.every((l) => p?.lessons.includes(l.id));
  const complete = isComplete(c, progress);
  async function mark() {
    setBusy(true);
    setSaveError("");
    try {
      if (lesson) {
        if (onProgress) await onProgress(lesson.id);
        else onDemoProgress?.(lesson.id);
      }
      setStep(Math.min(step + 1, c.lessons.length));
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setSaveError("");
    try {
      const passed = onProgress
        ? !!(await onProgress(undefined, answers))
        : !!onDemoProgress?.(undefined, answers);
      setResultPassed(passed);
      setResult(
        passed
          ? "Great work. You’ve completed this course."
          : complete
            ? "This attempt did not pass. Your previous completion is preserved."
            : "Not quite yet. Revisit the lessons and try again.",
      );
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="course-detail">
      <Button variant="link" onClick={onBack}>
        ← {backLabel}
      </Button>
      <div className="course-detail-heading">
        <span className="eyebrow">{c.category}</span>
        <h1>{c.title}</h1>
        <p>{c.summary}</p>
        <div className="course-detail-meta">
          <Clock size={16} />
          {c.duration} min <span>·</span>
          {c.lessons.length} lessons<span>·</span>
          {complete && <Badge variant="success">Completed</Badge>}
        </div>
      </div>
      {guest && onSignIn && (
        <div className="guest-progress-note">
          Your progress is saved in this browser.{" "}
          <Button variant="link" onClick={onSignIn}>
            Sign in to keep it across devices →
          </Button>
        </div>
      )}
      {saveError && (
        <Alert variant="destructive" role="alert">
          {saveError}
        </Alert>
      )}
      <div className="lesson-layout">
        <aside className="lesson-nav">
          <h3>In this course</h3>
          {c.lessons.map((l, i) => (
            <NavigationButton
              variant="ghost"
              className={step === i ? "selected" : ""}
              onClick={() => setStep(i)}
              key={l.id}
            >
              <span
                className={
                  "step-number " + (p?.lessons.includes(l.id) ? "done" : "")
                }
              >
                {p?.lessons.includes(l.id) ? <Check size={13} /> : i + 1}
              </span>
              {l.title}
            </NavigationButton>
          ))}
          <NavigationButton
            variant="ghost"
            className={step === c.lessons.length ? "selected" : ""}
            onClick={() => setStep(c.lessons.length)}
          >
            <CheckCircle2 size={18} />
            {c.questions.length ? "Quiz" : "Finish course"}
          </NavigationButton>
          <div className="lesson-progress">
            <Progress
              aria-label="Lessons completed"
              value={
                c.lessons.length
                  ? ((p?.lessons.length || 0) / c.lessons.length) * 100
                  : 0
              }
            />
            <small>
              {p?.lessons.length || 0} of {c.lessons.length} lessons complete
            </small>
          </div>
        </aside>
        <Card className="grid gap-6">
          {lesson ? (
            <>
              <span className="eyebrow">
                LESSON {step + 1} OF {c.lessons.length}
              </span>
              <h2>{lesson.title}</h2>
              {video?.type === "embed" ? (
                <iframe
                  className="lesson-video"
                  key={video.url}
                  src={video.url}
                  title={lesson.title + " video"}
                  allow="fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : video?.type === "file" ? (
                <video
                  key={video.url}
                  controls
                  preload="metadata"
                  src={video.url}
                >
                  Your browser does not support video playback.
                </video>
              ) : lesson.videoUrl ? (
                <Note>
                  This video URL is not supported. Ask an editor to update it.
                </Note>
              ) : null}
              <div className="markdown">
                <ReactMarkdown>{lesson.body}</ReactMarkdown>
              </div>
              <ActionGroup>
                {p?.lessons.includes(lesson.id) && (
                  <Badge variant="success">
                    <CheckCircle2 size={16} />
                    Lesson completed
                  </Badge>
                )}
                <Button variant="default" onClick={mark} loading={busy}>
                  {step === c.lessons.length - 1
                    ? "Continue to quiz"
                    : "Complete & continue"}
                  <ArrowRight size={16} />
                </Button>
              </ActionGroup>
            </>
          ) : (
            <>
              <h2>{complete ? "Course complete" : "Knowledge check"}</h2>
              <p>
                Answer every question correctly to complete the course. You can
                try again as often as you need.
              </p>
              {!allDone && (
                <Note>
                  Complete all lessons before submitting your answers.
                </Note>
              )}
              {c.questions.map((q, i) => (
                <FieldGroup className="quiz-question" key={q.id}>
                  <legend>
                    {i + 1}. {q.prompt}
                  </legend>
                  {q.options.map((o, j) => (
                    <Field orientation="horizontal" variant="choice" key={j}>
                      <Radio
                        name={q.id}
                        checked={answers[i] === j}
                        onChange={() => {
                          const next = [...answers];
                          next[i] = j;
                          setAnswers(next);
                          setResult(null);
                        }}
                      />
                      {o}
                    </Field>
                  ))}
                </FieldGroup>
              ))}
              {result && (
                <Alert
                  role="status"
                  variant={resultPassed ? "success" : "default"}
                >
                  {result}
                </Alert>
              )}
              <ActionGroup>
                <Button variant="outline" onClick={() => setStep(0)}>
                  Review lessons
                </Button>
                <Button
                  variant="default"
                  disabled={
                    busy ||
                    !allDone ||
                    c.questions.some((_, i) => answers[i] === undefined)
                  }
                  onClick={submit}
                >
                  {c.questions.length ? "Check answers" : "Complete course"}
                  <Check size={16} />
                </Button>
              </ActionGroup>
              {feedback}
              {complete && (
                <Button variant="link" onClick={onBack}>
                  {backLabel} <ArrowRight size={16} />
                </Button>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
