"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, CheckCircle2, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert } from "./ui/alert";
import { Note } from "./ui/note";
import { Card } from "./ui/card";
import { Radio, Checkbox } from "./ui/choice";
import { Field, FieldGroup } from "./ui/field";
import { ActionGroup } from "./ui/action-group";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { NavigationButton } from "./patterns/navigation-button";
import { CourseVideo } from "./patterns/course-video";
import Markdown from "./Markdown";
import { correctOptionIds, optionIds, quizUnlocked, requiresPassing, type QuizAnswers } from "@/lib/course-quiz";
import { isComplete, type Content, type Progress } from "@/lib/types";

export function Course({ course, progress, onBack, backLabel, onProgress, onDemoProgress,
  guest = false, onSignIn, feedback, initialLessonId, curriculumTitle, backHref, lessonBaseHref }: {
  course: Content;
  progress: Progress[];
  onBack: () => void;
  backLabel: string;
  onProgress?: (lessonId?: string, answers?: QuizAnswers, complete?: boolean) => Promise<boolean | undefined>;
  onDemoProgress?: (lessonId?: string, answers?: QuizAnswers, complete?: boolean) => boolean | undefined;
  guest?: boolean;
  onSignIn?: () => void;
  feedback?: ReactNode;
  initialLessonId?: string;
  curriculumTitle?: string;
  backHref?: string;
  lessonBaseHref?: string;
}) {
  const p = progress.find((entry) => entry.content_id === course.id && entry.version === course.version);
  const [step, setStep] = useState(() => {
    if (initialLessonId) return Math.max(0, course.lessons.findIndex((lesson) => lesson.id === initialLessonId));
    if (isComplete(course, progress)) return 0;
    const next = course.lessons.findIndex((lesson) => !p?.lessons.includes(lesson.id));
    return next < 0 ? course.lessons.length : next;
  });
  const [answers, setAnswers] = useState<QuizAnswers>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const didResume = useRef(false);
  const lesson = course.lessons[step];
  const allDone = course.lessons.every((item) => p?.lessons.includes(item.id));
  const complete = isComplete(course, progress);
  const latestAttempt = p?.attempts?.at(-1);
  const unlocked = allDone && (complete || !course.questions.length || result !== null && (!requiresPassing(course) || result) || quizUnlocked(course, p?.attempts));
  const multi = (index: number) => course.questions[index].multiple ?? correctOptionIds(course.questions[index]).length > 1;
  useEffect(() => {
    if (!guest || initialLessonId || !p || didResume.current) return;
    didResume.current = true;
    if (step !== 0) return;
    const next = course.lessons.findIndex((item) => !p.lessons.includes(item.id));
    if (next > 0) setStep(next);
    else if (next < 0 && !p.passed) setStep(course.lessons.length);
  }, [guest, initialLessonId, p, step, course.lessons]);
  useEffect(() => {
    if (step === 0) return;
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
  }, [step]);
  async function record(lessonId?: string, selections?: QuizAnswers, finish?: boolean) {
    return onProgress ? onProgress(lessonId, selections, finish) : onDemoProgress?.(lessonId, selections, finish);
  }
  function selectLesson(index: number, href?: string) {
    if (href) window.history.replaceState(window.history.state, "", href);
    setStep(index);
  }
  async function next() {
    setBusy(true); setSaveError("");
    try {
      await record(lesson.id);
      const following = course.lessons[step + 1];
      const href = following && lessonBaseHref
        ? `${lessonBaseHref}${lessonBaseHref.includes("?") ? "&" : "?"}lesson=${encodeURIComponent(following.id)}`
        : undefined;
      selectLesson(Math.min(step + 1, course.lessons.length), href);
    } catch (error) { setSaveError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true); setSaveError("");
    try { setResult(!!(await record(undefined, answers))); }
    catch (error) { setSaveError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function finish() {
    setBusy(true); setSaveError("");
    try { await record(undefined, undefined, true); onBack(); }
    catch (error) { setSaveError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="course-detail course-player">
    <div className="lesson-layout">
      <aside className="course-sidebar">
        {backHref ? <Button asChild variant="link" className="justify-self-start"><Link href={backHref}>← {backLabel}</Link></Button> : <Button variant="link" className="justify-self-start" onClick={onBack}>← {backLabel}</Button>}
        <div className="course-detail-heading">
          <span className="eyebrow">{curriculumTitle || course.category}</span>
          <h1>{course.title}</h1>
          <div className="course-about">
            <details><summary>About this course</summary><p>{course.summary}</p><p>{course.duration} min · {course.lessons.length} lessons</p>{course.body && <div className="markdown"><Markdown linkContext="course">{course.body}</Markdown></div>}</details>
            <p className="course-desktop-summary">{course.summary}</p>
            <div className="course-detail-meta course-desktop-summary"><Clock size={16} /> {course.duration} min · {course.lessons.length} lessons {complete && <Badge variant="success">Completed</Badge>}</div>
            {course.body && <div className="markdown course-desktop-summary"><Markdown linkContext="course">{course.body}</Markdown></div>}
          </div>
        </div>
        {guest && onSignIn && <p className="guest-progress-note">Progress is saved in this browser. <Button variant="link" onClick={onSignIn}>Sign in to keep it →</Button></p>}
        <nav className="lesson-nav" aria-label="In this course">
          <h2>In this course</h2>
          {course.lessons.map((item, index) => <NavigationButton variant="ghost" asChild={!!lessonBaseHref} className={step === index ? "selected" : ""} onClick={lessonBaseHref ? undefined : () => selectLesson(index)} key={item.id}>
            {lessonBaseHref ? <Link prefetch={false} href={`${lessonBaseHref}${lessonBaseHref.includes("?") ? "&" : "?"}lesson=${encodeURIComponent(item.id)}`} onClick={(event) => { event.preventDefault(); selectLesson(index, event.currentTarget.href); }}>
            <span className={"step-number " + (p?.lessons.includes(item.id) ? "done" : "")}>{p?.lessons.includes(item.id) ? <Check size={13} /> : index + 1}</span>
            <span>{item.title}</span>
            </Link> : <><span className={"step-number " + (p?.lessons.includes(item.id) ? "done" : "")}>{p?.lessons.includes(item.id) ? <Check size={13} /> : index + 1}</span><span>{item.title}</span></>}
          </NavigationButton>)}
          {!!course.questions.length && <NavigationButton variant="ghost" className={step === course.lessons.length ? "selected quiz-step" : "quiz-step"} onClick={() => setStep(course.lessons.length)}>
            <span className="step-number quiz-number"><CheckCircle2 size={16} /></span><span>Quiz</span>
          </NavigationButton>}
        </nav>
      </aside>
      <div className="course-reader">
        {saveError && <Alert variant="destructive" role="alert">{saveError}</Alert>}
        {lesson ? <>
          <Card className="course-lesson grid gap-6">
            <span className="eyebrow">Lesson {step + 1} of {course.lessons.length}</span>
            <h2 ref={heading} tabIndex={-1}>{lesson.title}</h2>
            {lesson.videoUrl && <CourseVideo key={lesson.videoUrl} url={lesson.videoUrl} title={`${lesson.title} video`} posterUrl={course.coverImageUrl} />}
            <div className="markdown"><Markdown linkContext="course" onImageOpen={(src, alt) => setImage({ src, alt })}>{lesson.body}</Markdown></div>
            {p?.lessons.includes(lesson.id) && <Badge variant="success"><CheckCircle2 size={16} /> Lesson completed</Badge>}
          </Card>
          <div className="course-continue"><Button variant="default" onClick={next} loading={busy}>
            {step < course.lessons.length - 1 ? "Next lesson" : course.questions.length ? "Continue to quiz" : "Finish lessons"} <ArrowRight size={16} />
          </Button></div>
        </> : <>
          {!!course.questions.length && <Card className="course-quiz grid gap-6">
            <span className="eyebrow">Quiz</span>
            <h2 ref={heading} tabIndex={-1}>Check your understanding</h2>
            <p>{requiresPassing(course) ? "Answer every question correctly to complete this course. You can retry." : "Complete the quiz to finish this course. You can review your answers afterward."}</p>
            {!allDone && <Note>Complete all lessons before submitting your answers.</Note>}
            {course.questions.map((question, index) => <FieldGroup className="quiz-question" key={question.id}>
              <legend>{index + 1}. {question.prompt}</legend>
              {result !== null && latestAttempt?.answers?.[index] && <Badge variant={latestAttempt.answers[index].correct ? "success" : "default"}>{latestAttempt.answers[index].correct ? "Correct" : "Review this answer"}</Badge>}
              <p className="muted">{multi(index) ? "Select all that apply." : "Select one answer."}</p>
              {question.options.map((option, optionIndex) => <Field orientation="horizontal" variant="choice" key={optionIds(question)[optionIndex]}>
                {multi(index) ? <Checkbox checked={answers[index]?.includes(optionIndex) || false} onCheckedChange={(checked) => {
                  const next = [...answers]; const selected = next[index] || [];
                  next[index] = checked ? [...selected, optionIndex] : selected.filter((value) => value !== optionIndex);
                  setAnswers(next); setResult(null);
                }} /> : <Radio name={question.id} checked={answers[index]?.[0] === optionIndex} onChange={() => { const next = [...answers]; next[index] = [optionIndex]; setAnswers(next); setResult(null); }} />}
                {option}
              </Field>)}
              {result !== null && question.explanation && <Note>{question.explanation}</Note>}
            </FieldGroup>)}
            {result !== null && <Alert role="status" variant={result ? "success" : "default"}>{result ? "All answers are correct." : requiresPassing(course) ? "Some answers need another try. Review and retry when ready." : "Quiz submitted. You can finish the course."}</Alert>}
            <ActionGroup>
              <Button variant="outline" onClick={() => setStep(0)}>Review lessons</Button>
              <Button disabled={busy || !allDone || course.questions.some((_, index) => !answers[index]?.length)} onClick={submit} loading={busy}>{result === null ? "Check answers" : "Try again"}</Button>
            </ActionGroup>
          </Card>}
          {unlocked && <div className="course-finish">{feedback}<Button variant="default" onClick={finish} loading={busy}>Complete course <ArrowRight size={16} /></Button></div>}
          {complete && !unlocked && <Note>This course was already completed. Your completion is preserved.</Note>}
        </>}
      </div>
    </div>
    <Dialog open={!!image} onOpenChange={(open) => { if (!open) setImage(null); }}>
      <DialogContent className="course-image-dialog"><DialogTitle>{image?.alt || "Course image"}</DialogTitle>
        {image && <img src={image.src} alt={image.alt} />}</DialogContent>
    </Dialog>
  </div>;
}
