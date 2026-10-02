import { test } from "node:test";
import assert from "node:assert/strict";
import {
  messageSources,
  recentAiMessages,
  type AskAiMessage,
} from "../lib/ai-chat";
const message = (
  id: string,
  role: "user" | "assistant",
  text: string,
): AskAiMessage => ({ id, role, parts: [{ type: "text", text }] });
test("AI follow-ups send bounded text only and exclude unfinished answers", () => {
  const history = [
    message("old", "assistant", "o".repeat(4001)),
    message("u1", "user", "First question"),
    message("a1", "assistant", "Verified answer"),
    message("bad", "assistant", "Unverified partial answer"),
    message("u2", "user", "What about that?"),
  ];
  history[2].parts.push({ type: "data-sources", data: [] });
  const recent = recentAiMessages(history, new Set(["old", "a1"]));
  assert.deepEqual(
    recent.map((item) => item.id),
    ["u1", "a1", "u2"],
  );
  assert.ok(
    recent.every((item) => item.parts.every((part) => part.type === "text")),
  );
  const long = Array.from({ length: 40 }, (_, i) =>
    message(String(i), i % 2 ? "assistant" : "user", "Short text"),
  );
  long.push(message("question", "user", "Next?"));
  assert.equal(
    recentAiMessages(long, new Set(long.map((item) => item.id))).length,
    7,
  );
});
test("source navigation requires an exact internal destination matching its identity", () => {
  const sources = [
    {
      id: "S1",
      contentId: "first",
      kind: "doc",
      title: "Reference",
      href: "/docs/first",
      lessonId: null,
    },
    {
      id: "S2",
      contentId: "course",
      kind: "course",
      title: "Course",
      href: "/courses/course?lesson=second",
      lessonId: "second",
    },
  ];
  const answer = message("a", "assistant", "Answer [S1] [S2]");
  answer.parts.push({ type: "data-sources", data: sources as any });
  assert.equal(messageSources(answer).length, 2);
  for (const href of [
    "https://external.example",
    "javascript:alert(1)",
    "/docs/other",
    "//external.example",
    "/admin",
  ]) {
    answer.parts = [
      { type: "data-sources", data: [{ ...sources[0], href }] as any },
    ];
    assert.deepEqual(messageSources(answer), []);
  }
});
