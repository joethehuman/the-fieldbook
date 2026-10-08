"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert } from "./ui/alert";
import { Note } from "./ui/note";
import { Card } from "./ui/card";
import { QuizResults } from "./patterns/quiz-results";
import { Radio, Checkbox } from "./ui/choice";
import { Field, FieldGroup } from "./ui/field";
import { ActionGroup } from "./ui/action-group";
import { ImageViewer } from "./patterns/image-viewer";
import { NavigationButton } from "./patterns/navigation-button";
import { CourseVideo } from "./patterns/course-video";
import Markdown from "./Markdown";
import { correctOptionIds, optionIds, quizUnlocked, requiresPassing, type QuizAnswers } from "@/lib/course-quiz";
import { isComplete, type Content, type Progress } from "@/lib/types";

export function Course({ course, progress, onBack, backLabel, onProgress, onDemoProgress,
  guest = false, feedback, initialLessonId, curriculumTitle, backHref, lessonBaseHref }: {
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
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showResults, setShowResults] = useState(!!p?.attempts?.length);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const activeCard = useRef<HTMLElement>(null);
  const sidebarPanel = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const didResume = useRef(false);
  const lesson = course.lessons[step];
  const previousLesson = course.lessons[step - 1];
  // Keep the opening image button mounted while the viewer changes so focus can return.
  const lessonContent = useMemo(() => lesson ? <Markdown linkContext="course" onImageOpen={(src, alt) => setImage({ src, alt })}>{lesson.body}</Markdown> : null, [lesson]);
  const allDone = course.lessons.every((item) => p?.lessons.includes(item.id));
  const complete = isComplete(course, progress);
  const latestAttempt = p?.attempts?.at(-1);
  const question = course.questions[questionIndex];
  const score = latestAttempt?.answers?.filter((answer) => answer.correct).length;
  const multi = (index: number) => course.questions[index].multiple ?? correctOptionIds(course.questions[index]).length > 1;
  useLayoutEffect(() => {
    const panel = sidebarPanel.current;
    const details = panel?.querySelector<HTMLElement>(".course-detail-heading");
    const exit = panel?.querySelector<HTMLElement>(".course-sidebar-exit");
    if (!panel || !details || !exit) return;
    // Only the outline has a minimum. Measure the surrounding content so a
    // short viewport cannot clip it, without making the card fill a tall one.
    const measure = () => {
      const style = getComputedStyle(panel);
      const chrome = details.getBoundingClientRect().height + exit.getBoundingClientRect().height
        + 2 * parseFloat(style.rowGap)
        + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const value = `${chrome}px`;
      if (panel.style.getPropertyValue("--course-sidebar-chrome-height") !== value)
        panel.style.setProperty("--course-sidebar-chrome-height", value);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(details);
    observer.observe(exit);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!guest || initialLessonId || !p || didResume.current) return;
    didResume.current = true;
    if (step !== 0) return;
    const next = course.lessons.findIndex((item) => !p.lessons.includes(item.id));
    if (next > 0) setStep(next);
    else if (next < 0 && !p.passed) {
      setShowResults(!!p.attempts?.length);
      setStep(course.lessons.length);
    }
  }, [guest, initialLessonId, p, step, course.lessons]);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      activeCard.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
  }, [step, questionIndex, showResults]);
  async function record(lessonId?: string, selections?: QuizAnswers, finish?: boolean) {
    return onProgress ? onProgress(lessonId, selections, finish) : onDemoProgress?.(lessonId, selections, finish);
  }
  function selectLesson(index: number, href?: string) {
    if (href) window.history.replaceState(window.history.state, "", href);
    setStep(index);
  }
  function previous() {
    if (!previousLesson || busy) return;
    const href = lessonBaseHref
      ? `${lessonBaseHref}${lessonBaseHref.includes("?") ? "&" : "?"}lesson=${encodeURIComponent(previousLesson.id)}`
      : undefined;
    selectLesson(step - 1, href);
  }
  async function next() {
    setBusy(true); setSaveError("");
    try {
      await record(lesson.id, undefined, step === course.lessons.length - 1 && !course.questions.length);
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
    try {
      await record(undefined, answers, true);
      setShowResults(true);
    }
    catch (error) { setSaveError((error as Error).message); }
    finally { setBusy(false); }
  }
  function retry() {
    setAnswers([]);
    setQuestionIndex(0);
    setShowResults(false);
  }
  async function completeEarlierProgress() {
    setBusy(true); setSaveError("");
    try { await record(undefined, undefined, true); }
    catch (error) { setSaveError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="course-detail course-player">
    <div className="lesson-layout">
      <aside className="course-sidebar">
        <Card ref={sidebarPanel} className="course-sidebar-panel">
          <div className="course-detail-heading">
            <span className="eyebrow">{curriculumTitle || course.category}</span>
            <h1>{course.title}</h1>
            <div className="course-about">
              <details><summary><span>About this course</span><span className="course-about-toggle" aria-hidden="true"><Plus className="course-about-plus" size={16} /><Minus className="course-about-minus" size={16} /></span></summary><div className="course-about-content"><p>{course.summary}</p><div className="course-detail-meta"><span className="course-duration"><Clock size={16} aria-hidden="true" />{course.duration} min</span><span aria-hidden="true">·</span><span>{course.lessons.length} lessons</span></div></div></details>
              <p className="course-desktop-summary">{course.summary}</p>
              <div className="course-detail-meta course-desktop-summary"><span className="course-duration"><Clock size={16} aria-hidden="true" />{course.duration} min</span><span aria-hidden="true">·</span><span>{course.lessons.length} lessons</span><Badge variant="success" className={complete ? undefined : "invisible"} aria-hidden={!complete}>Completed</Badge></div>
            </div>
          </div>
          <nav className="lesson-nav" aria-label="In this course">
            <h2>In this course</h2>
            {course.lessons.map((item, index) => <NavigationButton variant="ghost" asChild={!!lessonBaseHref} className={step === index ? "selected" : ""} onClick={lessonBaseHref ? undefined : () => selectLesson(index)} key={item.id}>
              {lessonBaseHref ? <Link prefetch={false} href={`${lessonBaseHref}${lessonBaseHref.includes("?") ? "&" : "?"}lesson=${encodeURIComponent(item.id)}`} onClick={(event) => { event.preventDefault(); selectLesson(index, event.currentTarget.href); }}>
              <span className={"step-number " + (p?.lessons.includes(item.id) ? "done" : "")}>{p?.lessons.includes(item.id) ? <Check size={13} /> : index + 1}</span>
              <span>{item.title}</span>
              </Link> : <><span className={"step-number " + (p?.lessons.includes(item.id) ? "done" : "")}>{p?.lessons.includes(item.id) ? <Check size={13} /> : index + 1}</span><span>{item.title}</span></>}
            </NavigationButton>)}
            <NavigationButton variant="ghost" className={step === course.lessons.length ? "selected quiz-step" : "quiz-step"} onClick={() => setStep(course.lessons.length)}>
              <span className="step-number quiz-number"><CheckCircle2 size={16} /></span><span>{course.questions.length ? "Quiz" : "Finish course"}</span>
            </NavigationButton>
          </nav>
          <div className="course-sidebar-exit">
            {backHref ? <Button asChild variant="link"><Link href={backHref} aria-label={`Exit course, ${backLabel.toLowerCase()}`}>← Exit course</Link></Button> : <Button variant="link" onClick={onBack}>← Exit course</Button>}
          </div>
        </Card>
      </aside>
      <div className="course-reader">
        {saveError && <Alert variant="destructive" role="alert" onDismiss={() => setSaveError("")}>{saveError}</Alert>}
        {lesson ? <>
          <section ref={activeCard} className="course-lesson grid gap-6">
            <span className="eyebrow">Lesson {step + 1} of {course.lessons.length}</span>
            <h2 ref={heading} tabIndex={-1}>{lesson.title}</h2>
            {lesson.videoUrl && <CourseVideo key={lesson.videoUrl} url={lesson.videoUrl} title={`${lesson.title} video`} posterUrl={course.coverImageUrl} eager />}
            <div className="markdown">{lessonContent}</div>
            {p?.lessons.includes(lesson.id) && <Badge variant="success"><CheckCircle2 size={16} /> Lesson completed</Badge>}
          </section>
        </> : <section ref={activeCard} className={`${course.questions.length ? "course-quiz" : "course-finish-card"} grid gap-6`}>
          {course.questions.length ? showResults ? <QuizResults
            questions={course.questions}
            answers={latestAttempt?.answers}
            complete={complete}
            headingRef={heading}
            message={complete ? "Course complete." : quizUnlocked(course, p?.attempts) ? "Your quiz is graded. Finish the course to save completion." : "Answer all questions correctly to complete this course. Retry when you’re ready."}
            actions={<>
              {complete && <Button onClick={onBack}>Close course</Button>}
              {!complete && quizUnlocked(course, p?.attempts) && <Button onClick={completeEarlierProgress} loading={busy}>Finish course</Button>}
              {(score === undefined || score < course.questions.length) && <Button variant={complete ? "outline" : "default"} onClick={retry}>Retry quiz</Button>}
            </>}
            feedback={complete ? feedback : undefined}
          /> : <>
            <span className="eyebrow">Question {questionIndex + 1} of {course.questions.length}</span>
            <h2 ref={heading} tabIndex={-1}>Check your knowledge</h2>
            {questionIndex === 0 && <p>{requiresPassing(course) ? "Answer every question correctly to complete this course. You can retry after seeing your results." : "Answer each question, then see your results. Passing is not required to complete this course."}</p>}
            {!allDone && <Note>Complete all lessons before submitting your answers.</Note>}
            <FieldGroup className="quiz-question" key={question.id}>
              <legend>{question.prompt}</legend>
              <p className="muted">{multi(questionIndex) ? "Select all that apply." : "Select one answer."}</p>
              {question.options.map((option, optionIndex) => <Field orientation="horizontal" variant="choice" key={optionIds(question)[optionIndex]}>
                {multi(questionIndex) ? <Checkbox checked={answers[questionIndex]?.includes(optionIndex) || false} onCheckedChange={(checked) => {
                  const next = [...answers]; const selected = next[questionIndex] || [];
                  next[questionIndex] = checked ? [...selected, optionIndex] : selected.filter((value) => value !== optionIndex);
                  setAnswers(next);
                }} /> : <Radio name={question.id} checked={answers[questionIndex]?.[0] === optionIndex} onChange={() => { const next = [...answers]; next[questionIndex] = [optionIndex]; setAnswers(next); }} />}
                {option}
              </Field>)}
            </FieldGroup>
            <ActionGroup>
              {questionIndex > 0 && <Button variant="outline" onClick={() => setQuestionIndex(questionIndex - 1)}>Previous question</Button>}
              <Button className="transition-none" disabled={busy || !allDone || !answers[questionIndex]?.length} onClick={questionIndex === course.questions.length - 1 ? submit : () => setQuestionIndex(questionIndex + 1)} loading={busy}>
                {questionIndex === course.questions.length - 1 ? "Submit and see results" : "Submit and continue"} <ArrowRight size={16} />
              </Button>
            </ActionGroup>
          </> : <>
            <span className="eyebrow">Finish course</span>
            <h2 ref={heading} tabIndex={-1}>{complete ? "Course complete" : "Finish the lessons"}</h2>
            {complete ? <>
              <p>You’ve finished this course. Feedback is optional.</p>
              {feedback}
              <ActionGroup className="justify-center"><Button onClick={onBack}>Close course</Button></ActionGroup>
            </> : <>
              <p>Complete every lesson to finish this course.</p>
              <ActionGroup>
                <Button variant="outline" onClick={() => setStep(0)}>Review lessons</Button>
                {allDone && <Button onClick={completeEarlierProgress} loading={busy}>Finish course</Button>}
              </ActionGroup>
            </>}
          </>}
        </section>}
        {(lesson || previousLesson) && <nav className="course-continue reading-pagination" aria-label="Continue course">
          {previousLesson && <Button variant="ghost" data-direction="previous" className="reading-pagination-link h-auto min-w-0 whitespace-normal" onClick={previous} disabled={busy}>
            <ChevronLeft aria-hidden="true" size={16} /><span className="grid min-w-0 gap-1"><span className="course-continue-label text-xs font-normal text-muted-foreground">Previous lesson</span><span className="course-continue-title [overflow-wrap:anywhere]">{previousLesson.title}</span></span>
          </Button>}
          {lesson && <Button variant="ghost" data-direction="next" className="reading-pagination-link h-auto min-w-0 whitespace-normal" onClick={next} loading={busy}>
            <span className="grid min-w-0 gap-1"><span className="course-continue-label text-xs font-normal text-muted-foreground">{step < course.lessons.length - 1 ? "Next lesson" : course.questions.length ? "Quiz" : "Finish course"}</span><span className="course-continue-title [overflow-wrap:anywhere]">{step < course.lessons.length - 1 ? course.lessons[step + 1].title : course.questions.length ? "Check your knowledge" : "Course complete"}</span></span><ChevronRight aria-hidden="true" size={16} />
          </Button>}
        </nav>}
      </div>
    </div>
    <ImageViewer image={image} onClose={() => setImage(null)} />
  </div>;
}
