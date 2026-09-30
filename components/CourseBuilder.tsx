"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { Content, Question } from "@/lib/types";
import { correctOptionIds, optionIds, requiresPassing } from "@/lib/course-quiz";
import type { UploadMedia } from "./MarkdownEditor";
import { WritingEditor } from "./patterns/writing-editor";
import { EditorFrame, type DetailsReveal } from "./patterns/editor-frame";
import { SectionHeader } from "./patterns/layout";
import { FormField } from "./patterns/form-field";
import { NavigationButton } from "./patterns/navigation-button";
import { ActionGroup } from "./ui/action-group";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Checkbox } from "./ui/choice";
import { Field } from "./ui/field";
import { Input } from "./ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Textarea } from "./ui/textarea";

const id = () => crypto.randomUUID();
const newQuestion = (): Question => {
  const optionIds = [id(), id()];
  return { id: id(), prompt: "", options: ["", ""], optionIds, correctOptionIds: [optionIds[0]], explanation: "" };
};

/** Only the active lesson or final quiz is mounted, preserving a short edit surface. */
export function CourseBuilder({ course, onChange, onUpload, disabled, revealStep, details, requirementsCount, revealDetails, incompleteSteps = [] }: {
  course: Content;
  onChange: (updater: (current: Content) => Content) => void;
  onUpload?: UploadMedia;
  disabled: boolean;
  details: ReactNode;
  requirementsCount?: number;
  revealDetails?: DetailsReveal;
  incompleteSteps?: string[];
  revealStep?: { id: string; request: number; target?: "title" | "body"; questionId?: string };
}) {
  const [selectedId, setSelected] = useState(course.lessons[0]?.id || "quiz");
  const selected = course.lessons.some((lesson) => lesson.id === selectedId) || (selectedId === "quiz" && course.questions.length)
    ? selectedId : course.lessons[0]?.id || (course.questions.length ? "quiz" : "");
  const [canvasRequest, setCanvasRequest] = useState(0);
  const [outlineRequest, setOutlineRequest] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const lessonTitle = useRef<HTMLInputElement>(null);
  const pendingNavigation = useRef<{ step: string; instant: boolean } | null>(null);
  const navigationFrame = useRef(0);
  const selectedLesson = course.lessons.find((lesson) => lesson.id === selected);
  function chooseStep(step: string, instant = false) {
    cancelAnimationFrame(navigationFrame.current);
    pendingNavigation.current = { step, instant };
    if (instant) setSelected(step);
    setCanvasRequest((request) => request + 1);
  }
  useEffect(() => {
    if (!revealStep) return;
    cancelAnimationFrame(navigationFrame.current);
    pendingNavigation.current = null;
    if (revealStep.id === "outline") {
      setOutlineRequest((request) => request + 1);
      return;
    }
    setSelected(revealStep.id);
    setCanvasRequest((request) => request + 1);
    const frame = requestAnimationFrame(() => {
      const scope = revealStep.questionId
        ? panel.current?.querySelector<HTMLElement>(`[data-question-id="${CSS.escape(revealStep.questionId)}"]`)
        : panel.current;
      const target = revealStep.target === "body"
        ? (scope?.querySelector<HTMLElement>('[contenteditable="true"], textarea[aria-label="Lesson content Markdown"]') || scope?.querySelector<HTMLElement>('[aria-label="Editor view"] button'))
        : revealStep.id !== "quiz" ? lessonTitle.current : scope?.querySelector<HTMLElement>("input");
      (target || panel.current)?.focus({ preventScroll: true });
      if (target && target === lessonTitle.current) target.scrollIntoView({ block: "nearest" });
      else (target?.closest('[data-slot="field"]') || panel.current)?.scrollIntoView({ block: "start" });
    });
    navigationFrame.current = frame;
    return () => cancelAnimationFrame(frame);
  }, [revealStep]);
  useEffect(() => {
    const navigation = pendingNavigation.current;
    if (disabled) {
      cancelAnimationFrame(navigationFrame.current);
      pendingNavigation.current = null;
      return;
    }
    if (!navigation) return;
    let frame = 0;
    const queueFrame = (callback: FrameRequestCallback) => {
      frame = requestAnimationFrame(callback);
      navigationFrame.current = frame;
    };
    queueFrame(() => {
      const surface = panel.current;
      const viewport = surface?.closest<HTMLElement>(".main-content");
      const position = () => {
        if (!surface || !viewport) return 0;
        const inset = parseFloat(getComputedStyle(surface).scrollMarginBlockStart) || 0;
        return surface.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientTop - inset;
      };
      const finish = () => {
        if (pendingNavigation.current !== navigation) return;
        pendingNavigation.current = null;
        setSelected(navigation.step);
        surface?.focus({ preventScroll: true });
      };
      const delta = position();
      const leadingHeight = surface?.querySelector<HTMLElement>('[aria-label="Editor view"], h2')?.getBoundingClientRect().height || 0;
      const inset = surface ? parseFloat(getComputedStyle(surface).scrollMarginBlockStart) || 0 : 0;
      if (!viewport || !surface || (delta >= 0 && delta + inset + leadingHeight <= viewport.clientHeight)) {
        finish();
        return;
      }
      const start = viewport.scrollTop;
      const destination = Math.max(0, start + delta);
      if (navigation.instant || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        viewport.scrollTo({ top: destination, behavior: "instant" });
        finish();
        return;
      }
      // Scroll the outgoing lesson first: swapping a long body earlier clamps the viewport.
      const started = performance.now();
      const animate: FrameRequestCallback = (now) => {
        if (pendingNavigation.current !== navigation) return;
        const progress = Math.min(1, (now - started) / 180);
        viewport.scrollTo({ top: start + (destination - start) * (1 - (1 - progress) ** 3), behavior: "instant" });
        if (progress < 1) queueFrame(animate);
        else {
          viewport.scrollTo({ top: Math.max(0, viewport.scrollTop + position()), behavior: "instant" });
          finish();
        }
      };
      queueFrame(animate);
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasRequest, disabled]);
  const editLesson = (update: (lesson: Content["lessons"][number]) => Content["lessons"][number]) =>
    onChange((current) => ({ ...current, lessons: current.lessons.map((lesson) => lesson.id === selected ? update(lesson) : lesson) }));
  const editQuestion = (questionId: string, update: (question: Question) => Question) =>
    onChange((current) => ({ ...current, questions: current.questions.map((question) => question.id === questionId ? update(question) : question) }));
  function move(index: number, direction: number) {
    onChange((current) => {
      const lessons = [...current.lessons];
      [lessons[index], lessons[index + direction]] = [lessons[index + direction], lessons[index]];
      return { ...current, lessons };
    });
  }
  function addLesson() {
    const lesson = { id: id(), title: "", body: "" };
    onChange((current) => ({ ...current, lessons: [...current.lessons, lesson] }));
    chooseStep(lesson.id);
  }
  const lessonActions = selectedLesson && (
      <ActionGroup className="shrink-0 flex-nowrap gap-0 pr-1" role="group" aria-label={`Actions for ${selectedLesson.title || "selected lesson"}`}>
        <Button type="button" variant="ghost" size="icon" aria-label="Move lesson up" disabled={disabled || selectedLesson === course.lessons[0]} onClick={() => move(course.lessons.indexOf(selectedLesson), -1)}><ChevronUp size={16} /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Move lesson down" disabled={disabled || selectedLesson === course.lessons.at(-1)} onClick={() => move(course.lessons.indexOf(selectedLesson), 1)}><ChevronDown size={16} /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Lesson actions" disabled={disabled}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={disabled} onSelect={() => {
              const copy = { ...selectedLesson, id: id(), title: selectedLesson.title ? `${selectedLesson.title} copy` : "" };
              onChange((current) => ({ ...current, lessons: [...current.lessons.slice(0, current.lessons.findIndex((lesson) => lesson.id === selected) + 1), copy, ...current.lessons.slice(current.lessons.findIndex((lesson) => lesson.id === selected) + 1)] }));
              chooseStep(copy.id);
            }}><Copy size={16} /> Duplicate lesson</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={disabled || course.lessons.length <= 1} onSelect={() => {
              const index = course.lessons.indexOf(selectedLesson);
              onChange((current) => ({ ...current, lessons: current.lessons.filter((lesson) => lesson.id !== selected) }));
              chooseStep(course.lessons[index === 0 ? 1 : index - 1].id, true);
            }}><Trash2 size={16} /> Remove lesson</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ActionGroup>
  );
  const outline = <>
    <nav className="course-builder-steps" aria-label="Edit course step">
      {course.lessons.map((lesson, index) => <div key={lesson.id} className={`flex min-w-0 items-center rounded-control${selected === lesson.id ? " bg-accent" : ""}`}><NavigationButton type="button" disabled={disabled} title={lesson.title || `Lesson ${index + 1}`} aria-current={selected === lesson.id ? "step" : undefined} className="min-w-0 flex-1 items-start [&>span]:w-full [&>span]:min-w-0 [&>span]:justify-start [&>span]:items-start" onClick={() => chooseStep(lesson.id)}>
        <span className="step-number">{index + 1}</span><span className="grid min-w-0 gap-0.5"><span className="truncate">{lesson.title || `Lesson ${index + 1}`}</span>{incompleteSteps.includes(lesson.id) && <span className="truncate text-caption font-normal text-muted-foreground">Needs content</span>}</span>
      </NavigationButton>{selected === lesson.id && lessonActions}</div>)}
      {!!course.questions.length && <NavigationButton type="button" disabled={disabled} aria-current={selected === "quiz" ? "step" : undefined} className={selected === "quiz" ? "selected quiz-step" : "quiz-step"} onClick={() => chooseStep("quiz")}><span className="step-number quiz-number"><Check size={15} /></span><span className="grid min-w-0 gap-0.5"><span>Quiz</span>{incompleteSteps.includes("quiz") && <span className="text-caption font-normal text-muted-foreground">Needs content</span>}</span></NavigationButton>}
    </nav>
    <ActionGroup className="flex-col items-stretch">
      <Button type="button" size="sm" variant="outline" className="w-full" disabled={disabled} onClick={addLesson}><Plus size={15} /> Add lesson</Button>
      {!course.questions.length && <Button type="button" size="sm" variant="ghost" className="w-full" disabled={disabled} onClick={() => {
        onChange((current) => ({ ...current, questions: [newQuestion()], requirePassing: false }));
        chooseStep("quiz");
      }}><Plus size={15} /> Add quiz</Button>}
    </ActionGroup>
  </>;
  return <EditorFrame
    outline={outline}
    outlineContext={selectedLesson ? `Lesson ${course.lessons.indexOf(selectedLesson) + 1} of ${course.lessons.length}` : selected === "quiz" ? "Quiz" : undefined}
    heading={selectedLesson && <Input key={selectedLesson.id} ref={lessonTitle} variant="title" aria-label="Lesson title" placeholder="Untitled lesson" required disabled={disabled} value={selectedLesson.title} onChange={(event) => editLesson((lesson) => ({ ...lesson, title: event.target.value }))} />}
    details={details}
    requirementsCount={requirementsCount}
    revealDetails={revealDetails}
    revealCanvas={canvasRequest}
    revealOutline={outlineRequest}
    disabled={disabled}
  >
    <div className="course-builder-panel" ref={panel} tabIndex={-1} role="region" aria-label="Course lessons and quiz">
      {selectedLesson ? <WritingEditor key={selectedLesson.id} label="Lesson content" value={selectedLesson.body} onChange={(body) => editLesson((lesson) => ({ ...lesson, body }))} onUpload={onUpload} disabled={disabled} /> : selected === "quiz" && course.questions.length ? <div className="grid gap-5">
        <SectionHeader title={<h2>Quiz</h2>}><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => {
          onChange((current) => ({ ...current, questions: [] })); chooseStep(course.lessons.at(-1)?.id || "", true);
        }}><Trash2 size={15} /> Remove quiz</Button></SectionHeader>
        <p className="muted">The quiz always follows the lessons. Learners can retry; no passing score is required unless you enable it.</p>
        <Field orientation="horizontal"><Checkbox checked={requiresPassing(course)} onCheckedChange={(checked) => onChange((current) => ({ ...current, requirePassing: checked === true }))} /> Require all answers correct to complete</Field>
        {course.questions.map((question, index) => <Card key={question.id} data-question-id={question.id} className="grid gap-4">
          <SectionHeader title={<h3>Question {index + 1}</h3>}><Button type="button" variant="ghost" size="icon" aria-label={`Remove question ${index + 1}`} disabled={disabled || course.questions.length <= 1} onClick={() => onChange((current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id) }))}><Trash2 size={16} /></Button></SectionHeader>
          <FormField label="Question"><Input required value={question.prompt} onChange={(event) => editQuestion(question.id, (item) => ({ ...item, prompt: event.target.value }))} /></FormField>
          <p className="muted">Mark every correct answer. Keep at least one incorrect answer.</p>
          {question.options.map((option, optionIndex) => {
            const ids = optionIds(question); const correct = correctOptionIds(question);
            return <div className="answer-row" key={ids[optionIndex]}>
              <Checkbox aria-label={`Correct answer ${optionIndex + 1} for question ${index + 1}`} checked={correct.includes(ids[optionIndex])} onCheckedChange={(checked) => editQuestion(question.id, (item) => {
                const current = correctOptionIds(item); const value = optionIds(item)[optionIndex];
                return { ...item, answer: undefined, optionIds: optionIds(item), correctOptionIds: checked ? [...current, value] : current.filter((id) => id !== value) };
              })} />
              <Input aria-label={`Answer ${optionIndex + 1} for question ${index + 1}`} required value={option} onChange={(event) => editQuestion(question.id, (item) => ({ ...item, options: item.options.map((value, position) => position === optionIndex ? event.target.value : value) }))} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove answer ${optionIndex + 1}`} disabled={disabled || question.options.length <= 2} onClick={() => editQuestion(question.id, (item) => ({ ...item, optionIds: optionIds(item).filter((_, position) => position !== optionIndex), correctOptionIds: correctOptionIds(item).filter((id) => id !== ids[optionIndex]), answer: undefined, options: item.options.filter((_, position) => position !== optionIndex) }))}><Trash2 size={15} /></Button>
            </div>;
          })}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={disabled || question.options.length >= 5} onClick={() => editQuestion(question.id, (item) => ({ ...item, options: [...item.options, ""], optionIds: [...optionIds(item), id()], correctOptionIds: correctOptionIds(item), answer: undefined }))}><Plus size={15} /> Add answer</Button>
          <FormField label="Explanation (optional)"><Textarea rows={2} value={question.explanation || ""} onChange={(event) => editQuestion(question.id, (item) => ({ ...item, explanation: event.target.value }))} /></FormField>
        </Card>)}
        <Button type="button" variant="outline" className="justify-self-start" disabled={disabled} onClick={() => onChange((current) => ({ ...current, questions: [...current.questions, newQuestion()] }))}><Plus size={15} /> Add question</Button>
      </div> : null}
    </div>
  </EditorFrame>;
}
