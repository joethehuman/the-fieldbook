"use client";

import Link from "next/link";
import { useState } from "react";
import { QuizResults } from "@/components/patterns/quiz-results";
import { FilterOptions } from "@/components/patterns/filter-options";
import { Button } from "@/components/ui/button";
import { quizReviewExample } from "./examples";

export default function QuizReviewPage() {
  const [count, setCount] = useState("10");
  const [outcome, setOutcome] = useState("mixed");
  const example = quizReviewExample(Number(count), outcome === "correct");
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 sm:px-8">
      <header className="grid gap-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="link"><Link href="/#courses">← Back to Courses</Link></Button>
          <span className="text-xs text-muted-foreground">Local example · synthetic answers</span>
        </div>
        <h1 className="sr-only">Quiz results preview</h1>
        <div className="flex flex-wrap justify-between gap-x-8 gap-y-4">
          <FilterOptions
            label="Example question count"
            variant="underline"
            value={count}
            onValueChange={setCount}
            options={[
              { value: "1", label: "1 question" },
              { value: "2", label: "2 questions" },
              { value: "10", label: "10 questions" },
            ]}
          />
          <FilterOptions
            label="Example results"
            variant="underline"
            value={outcome}
            onValueChange={setOutcome}
            options={[
              { value: "mixed", label: "Mixed results" },
              { value: "correct", label: "All correct" },
            ]}
          />
        </div>
        <p className="text-copy text-muted-foreground">Compare short and long reviews, including a question with multiple answers. This example doesn’t change your course progress.</p>
      </header>
      <QuizResults
        key={`${count}-${outcome}`}
        questions={example.questions}
        answers={example.answers}
        complete={example.passed}
        message={example.passed ? "Course complete." : "Answer all questions correctly to complete this course. Retry when you’re ready."}
        defaultReviewOpen
      />
    </main>
  );
}
