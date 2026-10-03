"use client";

import { useState, type ReactNode, type Ref } from "react";
import { CheckCircle2, ChevronDown, RotateCcw } from "lucide-react";
import type { Progress, Question } from "@/lib/types";
import { optionIds } from "@/lib/course-quiz";
import { ActionGroup } from "../ui/action-group";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { FilterOptions } from "./filter-options";

type SavedAnswers = NonNullable<NonNullable<Progress["attempts"]>[number]["answers"]>;

/** Presents saved verdicts; the course owns grading, completion and actions. */
export function QuizResults({
  questions,
  answers,
  complete,
  message,
  actions,
  feedback,
  headingRef,
  defaultReviewOpen = false,
}: {
  questions: Question[];
  answers?: SavedAnswers;
  complete: boolean;
  message: string;
  actions?: ReactNode;
  feedback?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  defaultReviewOpen?: boolean;
}) {
  const score = answers?.filter(answer => answer.correct).length;
  return (
    <div className="grid min-w-0 gap-6" data-slot="quiz-results">
      <div className="grid gap-5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-full ${complete ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
            {complete ? <CheckCircle2 size={20} /> : <RotateCcw size={20} />}
          </span>
          <span className="eyebrow">Quiz results</span>
        </div>
        <div className="grid gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="text-page font-semibold tracking-tight">
            {score === undefined ? "Quiz submitted" : `${score} of ${questions.length} correct`}
          </h2>
          <p role="status" className="text-copy text-muted-foreground">{message}</p>
        </div>
        {actions && <ActionGroup>{actions}</ActionGroup>}
      </div>
      {answers && <AnswerReview questions={questions} answers={answers} defaultOpen={defaultReviewOpen} />}
      {feedback && <div className="pt-2">{feedback}</div>}
    </div>
  );
}

function AnswerReview({ questions, answers, defaultOpen }: {
  questions: Question[];
  answers: SavedAnswers;
  defaultOpen: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const items = questions.map((question, index) => ({
    question,
    number: index + 1,
    saved: answers.find(answer => answer.questionId === question.id),
  }));
  const incorrect = items.filter(item => !item.saved?.correct);
  const canFilter = questions.length > 3 && incorrect.length > 0;
  const visible = canFilter && filter === "incorrect" ? incorrect : items;

  return (
    <Card asChild className="overflow-hidden p-0 sm:p-0">
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="group/review w-full justify-start rounded-none p-4 focus-visible:ring-inset focus-visible:ring-offset-0 sm:px-6">
            <ChevronDown aria-hidden="true" className="transition-transform duration-150 group-data-[state=open]/review:rotate-180 motion-reduce:transition-none" />
            Review answers
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-4 sm:px-6">
            {canFilter && <div className="pt-2">
              <FilterOptions
                label="Answer review filter"
                variant="underline"
                value={filter}
                onValueChange={setFilter}
                options={[
                  { value: "all", label: `All ${questions.length}` },
                  { value: "incorrect", label: `Incorrect ${incorrect.length}` },
                ]}
              />
              <p role="status" className="sr-only">{visible.length} of {questions.length} questions shown</p>
            </div>}
            <ol role="list" aria-label="Reviewed answers" className="divide-y divide-border">
              {visible.map(({ question, number, saved }) => {
                const selected = question.options.filter((_, index) => saved?.optionIds.includes(optionIds(question)[index]));
                return (
                  <li key={question.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 py-6 sm:gap-x-4">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground">
                      <span className="sr-only">Question </span>{number}
                    </span>
                    <div className="grid min-w-0 gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap sm:gap-4">
                        <h3 className="min-w-0 basis-full text-base font-medium leading-6 [overflow-wrap:anywhere] sm:basis-auto sm:flex-1">{question.prompt}</h3>
                        <Badge variant={saved?.correct ? "success" : "destructive"}>{saved?.correct ? "Correct" : "Incorrect"}</Badge>
                      </div>
                      <div className="grid gap-1 rounded-lg bg-muted/60 px-4 py-3">
                        <strong className="text-xs font-normal text-muted-foreground">{selected.length > 1 ? "Your answers:" : "Your answer:"}</strong>
                        {selected.length > 1 ? <ul className="list-disc space-y-1 pl-4 text-copy [overflow-wrap:anywhere]">
                          {selected.map((answer, index) => <li key={index}>{answer}</li>)}
                        </ul> : <p className="text-copy [overflow-wrap:anywhere]">{selected[0] || "Unavailable"}</p>}
                      </div>
                      {question.explanation && <p className="text-copy text-muted-foreground [overflow-wrap:anywhere]">{question.explanation}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
