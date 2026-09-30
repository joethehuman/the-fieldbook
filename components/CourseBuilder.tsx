"use client";
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
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
import { SelectField } from "./ui/select";
import { Textarea } from "./ui/textarea";

const id = () => crypto.randomUUID();
const newQuestion = (): Question => {
  const optionIds = [id(), id()];
  return { id: id(), prompt: "", options: ["", ""], optionIds, correctOptionIds: [optionIds[0]], explanation: "" };
};

/** Only the active lesson or final quiz is mounted, preserving a short edit surface. */
export function CourseBuilder({ course, onChange, onUpload, disabled }: {
  course: Content;
  onChange: (updater: (current: Content) => Content) => void;
  onUpload?: UploadMedia;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState(course.lessons[0]?.id || "quiz");
  const selectedLesson = course.lessons.find((lesson) => lesson.id === selected);
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
  return <section className="course-builder" aria-label="Course lessons and quiz">
    <div className="course-builder-outline">
      <SectionHeader title={<h2>Course Outline</h2>}>
        <ActionGroup>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => {
            const lesson = { id: id(), title: `Lesson ${course.lessons.length + 1}`, body: "" };
            onChange((current) => ({ ...current, lessons: [...current.lessons, lesson] }));
            setSelected(lesson.id);
          }}><Plus size={15} /> Add lesson</Button>
          {!course.questions.length && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => {
            onChange((current) => ({ ...current, questions: [newQuestion()], requirePassing: false }));
            setSelected("quiz");
          }}><Plus size={15} /> Add quiz</Button>}
        </ActionGroup>
      </SectionHeader>
      <div className="course-builder-picker">
        <SelectField aria-label="Edit course step" value={selected} onValueChange={setSelected}>
          {course.lessons.map((lesson, index) => <option key={lesson.id} value={lesson.id}>{index + 1}. {lesson.title || `Lesson ${index + 1}`}</option>)}
          {!!course.questions.length && <option value="quiz">Quiz</option>}
        </SelectField>
      </div>
      <nav className="course-builder-steps" aria-label="Edit course step">
        {course.lessons.map((lesson, index) => <NavigationButton type="button" key={lesson.id} variant="ghost" aria-current={selected === lesson.id ? "step" : undefined} className={selected === lesson.id ? "w-auto max-w-full selected" : "w-auto max-w-full"} onClick={() => setSelected(lesson.id)}>
          <span className="step-number">{index + 1}</span><span>{lesson.title || `Lesson ${index + 1}`}</span>
        </NavigationButton>)}
        {!!course.questions.length && <NavigationButton type="button" variant="ghost" aria-current={selected === "quiz" ? "step" : undefined} className={selected === "quiz" ? "w-auto max-w-full selected quiz-step" : "w-auto max-w-full quiz-step"} onClick={() => setSelected("quiz")}><span className="step-number quiz-number"><Check size={15} /></span>Quiz</NavigationButton>}
      </nav>
    </div>
    <div className="course-builder-panel">
      {selectedLesson ? <Card className="grid gap-5" key={selectedLesson.id}>
        <SectionHeader title={<h2>Lesson {course.lessons.indexOf(selectedLesson) + 1}</h2>}>
          <ActionGroup>
            <Button type="button" variant="ghost" size="icon" aria-label="Move lesson up" disabled={disabled || selectedLesson === course.lessons[0]} onClick={() => move(course.lessons.indexOf(selectedLesson), -1)}><ChevronUp size={16} /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Move lesson down" disabled={disabled || selectedLesson === course.lessons.at(-1)} onClick={() => move(course.lessons.indexOf(selectedLesson), 1)}><ChevronDown size={16} /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Duplicate lesson" disabled={disabled} onClick={() => {
              const copy = { ...selectedLesson, id: id(), title: `${selectedLesson.title} copy` };
              onChange((current) => ({ ...current, lessons: [...current.lessons.slice(0, current.lessons.findIndex((lesson) => lesson.id === selected) + 1), copy, ...current.lessons.slice(current.lessons.findIndex((lesson) => lesson.id === selected) + 1)] }));
              setSelected(copy.id);
            }}><Copy size={16} /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove lesson" disabled={disabled || course.lessons.length <= 1} onClick={() => {
              const index = course.lessons.indexOf(selectedLesson);
              onChange((current) => ({ ...current, lessons: current.lessons.filter((lesson) => lesson.id !== selected) }));
              setSelected(course.lessons[index === 0 ? 1 : index - 1].id);
            }}><Trash2 size={16} /></Button>
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
        {course.questions.map((question, index) => <Card key={question.id} className="grid gap-4">
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
