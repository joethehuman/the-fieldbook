"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Trash2, X } from "lucide-react";
import type { Content, Question } from "@/lib/types";
import { correctOptionIds, optionIds, requiresPassing } from "@/lib/course-quiz";
import type { UploadMedia } from "./MarkdownEditor";
import { WritingEditor } from "./patterns/writing-editor";
import { SectionHeader } from "./patterns/layout";
import { FormField } from "./patterns/form-field";
import { NavigationButton } from "./patterns/navigation-button";
import { ActionGroup } from "./ui/action-group";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Checkbox } from "./ui/choice";
import { Field } from "./ui/field";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Textarea } from "./ui/textarea";

const id = () => crypto.randomUUID();
const newQuestion = (): Question => {
  const optionIds = [id(), id()];
  return { id: id(), prompt: "", options: ["", ""], optionIds, correctOptionIds: [optionIds[0]], explanation: "" };
};

/** Only the active lesson or final quiz is mounted, preserving a short edit surface. */
export function CourseBuilder({ course, onChange, onUpload, disabled, revealStep }: {
  course: Content;
  onChange: (updater: (current: Content) => Content) => void;
  onUpload?: UploadMedia;
  disabled: boolean;
  revealStep?: { id: string; request: number; target?: "title" | "body"; questionId?: string };
}) {
  const [selectedId, setSelected] = useState(course.lessons[0]?.id || "quiz");
  const selected = course.lessons.some((lesson) => lesson.id === selectedId) || (selectedId === "quiz" && course.questions.length)
    ? selectedId : course.lessons[0]?.id || (course.questions.length ? "quiz" : "");
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const outlineId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const hideOutline = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef(false);
  const focusAfterDrawer = useRef(false);
  const selectedLesson = course.lessons.find((lesson) => lesson.id === selected);
  const currentLabel = selectedLesson
    ? `${course.lessons.indexOf(selectedLesson) + 1}. ${selectedLesson.title || "Untitled lesson"}`
    : course.questions.length ? "Quiz" : "Choose a lesson";
  function chooseStep(step: string, focus = false) {
    pendingFocus.current = focus;
    focusAfterDrawer.current = focus && drawerOpen;
    setSelected(step);
    setDrawerOpen(false);
  }
  useEffect(() => {
    if (!revealStep) return;
    setSelected(revealStep.id);
    setDrawerOpen(false);
    const frame = requestAnimationFrame(() => {
      const scope = revealStep.questionId
        ? panel.current?.querySelector<HTMLElement>(`[data-question-id="${CSS.escape(revealStep.questionId)}"]`)
        : panel.current;
      const target = revealStep.target === "body"
        ? (scope?.querySelector<HTMLElement>('[contenteditable="true"], textarea[aria-label="Lesson content Markdown"]') || scope?.querySelector<HTMLElement>('[aria-label="Editor view"] button'))
        : scope?.querySelector<HTMLElement>("input");
      (target || panel.current)?.focus({ preventScroll: true });
      (target?.closest('[data-slot="field"]') || panel.current)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealStep]);
  useEffect(() => {
    if (!pendingFocus.current || drawerOpen || focusAfterDrawer.current) return;
    pendingFocus.current = false;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [selected, drawerOpen]);
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
    const lesson = { id: id(), title: `Lesson ${course.lessons.length + 1}`, body: "" };
    onChange((current) => ({ ...current, lessons: [...current.lessons, lesson] }));
    chooseStep(lesson.id, true);
  }
  const outline = <>
    <nav className="course-builder-steps" aria-label="Edit course step">
      {course.lessons.map((lesson, index) => <NavigationButton type="button" key={lesson.id} disabled={disabled} aria-current={selected === lesson.id ? "step" : undefined} className={selected === lesson.id ? "selected items-start [&>span]:w-full [&>span]:justify-start [&>span]:items-start" : "items-start [&>span]:w-full [&>span]:justify-start [&>span]:items-start"} onClick={() => chooseStep(lesson.id)}>
        <span className="step-number">{index + 1}</span><span className="min-w-0 break-words">{lesson.title || `Lesson ${index + 1}`}</span>
      </NavigationButton>)}
      {!!course.questions.length && <NavigationButton type="button" disabled={disabled} aria-current={selected === "quiz" ? "step" : undefined} className={selected === "quiz" ? "selected quiz-step" : "quiz-step"} onClick={() => chooseStep("quiz")}><span className="step-number quiz-number"><Check size={15} /></span>Quiz</NavigationButton>}
    </nav>
    <ActionGroup className="flex-col items-stretch">
      <Button type="button" size="sm" variant="outline" className="w-full" disabled={disabled} onClick={addLesson}><Plus size={15} /> Add lesson</Button>
      {!course.questions.length && <Button type="button" size="sm" variant="ghost" className="w-full" disabled={disabled} onClick={() => {
        onChange((current) => ({ ...current, questions: [newQuestion()], requirePassing: false }));
        chooseStep("quiz", true);
      }}><Plus size={15} /> Add quiz</Button>}
    </ActionGroup>
  </>;
  return <section className={`course-builder${outlineOpen ? "" : " outline-collapsed"}`} aria-label="Course lessons and quiz">
    <aside id={outlineId} className="course-builder-outline" aria-label="Course outline" hidden={!outlineOpen}>
      <SectionHeader className="flex-nowrap items-center" title={<h2>Outline</h2>}>
        <Button type="button" variant="ghost" size="icon" ref={hideOutline} aria-label="Hide course outline" aria-controls={outlineId} aria-expanded={outlineOpen} onClick={() => {
          setOutlineOpen(false);
          requestAnimationFrame(() => reopen.current?.focus());
        }}><PanelLeftClose size={16} /></Button>
      </SectionHeader>
      {outline}
    </aside>
    <div className="course-builder-panel" ref={panel} tabIndex={-1}>
      <div className="course-builder-navigation">
        {!outlineOpen && <Button ref={reopen} type="button" variant="outline" size="sm" className="course-builder-reopen" aria-controls={outlineId} aria-expanded={false} onClick={() => { setOutlineOpen(true); requestAnimationFrame(() => hideOutline.current?.focus()); }}><PanelLeftOpen size={16} /> Show outline</Button>}
        <Button type="button" variant="outline" size="sm" className="course-builder-drawer-trigger" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><PanelLeftOpen size={16} /><span className="min-w-0 text-left break-words">Outline · {currentLabel}</span></Button>
      </div>
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent side="left" className="max-w-sm" onCloseAutoFocus={(event) => {
          if (focusAfterDrawer.current) { event.preventDefault(); focusAfterDrawer.current = false; pendingFocus.current = false; panel.current?.querySelector<HTMLInputElement>("input")?.focus(); }
        }}>
          <SectionHeader className="flex-nowrap items-center" title={<DialogTitle>Course outline</DialogTitle>}><Button type="button" variant="ghost" size="icon" aria-label="Close course outline" onClick={() => setDrawerOpen(false)}><X size={16} /></Button></SectionHeader>
          <DialogDescription>Choose a lesson or the final quiz to edit.</DialogDescription>
          {outline}
        </DialogContent>
      </Dialog>
      {selectedLesson ? <Card className="grid gap-5" key={selectedLesson.id}>
        <SectionHeader title={<h2>Lesson {course.lessons.indexOf(selectedLesson) + 1}</h2>}>
          <ActionGroup>
            <Button type="button" variant="ghost" size="icon" aria-label="Move lesson up" disabled={disabled || selectedLesson === course.lessons[0]} onClick={() => move(course.lessons.indexOf(selectedLesson), -1)}><ChevronUp size={16} /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Move lesson down" disabled={disabled || selectedLesson === course.lessons.at(-1)} onClick={() => move(course.lessons.indexOf(selectedLesson), 1)}><ChevronDown size={16} /></Button>
            <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" aria-label="Lesson actions" disabled={disabled}><MoreHorizontal size={16} /> Lesson actions</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={disabled} onSelect={() => {
              const copy = { ...selectedLesson, id: id(), title: `${selectedLesson.title} copy` };
              onChange((current) => ({ ...current, lessons: [...current.lessons.slice(0, current.lessons.findIndex((lesson) => lesson.id === selected) + 1), copy, ...current.lessons.slice(current.lessons.findIndex((lesson) => lesson.id === selected) + 1)] }));
              setSelected(copy.id);
            }}><Copy size={16} /> Duplicate lesson</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={disabled || course.lessons.length <= 1} onSelect={() => {
              const index = course.lessons.indexOf(selectedLesson);
              onChange((current) => ({ ...current, lessons: current.lessons.filter((lesson) => lesson.id !== selected) }));
              setSelected(course.lessons[index === 0 ? 1 : index - 1].id);
            }}><Trash2 size={16} /> Remove lesson</DropdownMenuItem>
          </DropdownMenuContent>
            </DropdownMenu>
          </ActionGroup>
        </SectionHeader>
        <FormField label="Lesson title"><Input required value={selectedLesson.title} onChange={(event) => editLesson((lesson) => ({ ...lesson, title: event.target.value }))} /></FormField>
        <WritingEditor label="Lesson content" value={selectedLesson.body} onChange={(body) => editLesson((lesson) => ({ ...lesson, body }))} onUpload={onUpload} disabled={disabled} />
      </Card> : selected === "quiz" && course.questions.length ? <div className="grid gap-5">
        <SectionHeader title={<h2>Quiz</h2>}><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => {
          onChange((current) => ({ ...current, questions: [] })); setSelected(course.lessons.at(-1)?.id || "");
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
  </section>;
}
