"use client";
import { useState } from "react";
import { CategorySettingsPanel } from "@/components/CategorySettingsPanel";
import { freshWorkspace } from "@/lib/store";
import { withPublishedSnapshots } from "@/lib/demo-publication";
import {
  categoryLists,
  assertCategoriesCanBeRemoved,
} from "@/lib/content-categories";
import { saveCategorySettings } from "@/lib/category-settings-save";
import { applyDemoBulk } from "@/lib/bulk-actions";

/** The real panel, including a large category, a draft and an empty category. */
export function CategoryExamples() {
  const [data, setData] = useState(() => {
    const workspace = freshWorkspace();
    const course = workspace.content.find((item) => item.kind === "course")!;
    workspace.content.push(
      ...Array.from({ length: 48 }, (_, index) => ({
        ...course,
        id: `category-example-course-${index + 1}`,
        title: `Example course ${String(index + 1).padStart(2, "0")}`,
      })),
    );
    const initial = withPublishedSnapshots(workspace);
    const lists = categoryLists(initial.content);
    initial.settings = {
      ...initial.settings!,
      contentCategories: {
        ...lists,
        course: [...lists.course, "Empty category"],
      },
    };
    return initial;
  });
  return (
    <section id="category-settings" className="grid gap-4">
      <h2>Category settings</h2>
      <CategorySettingsPanel
        data={data}
        onSave={async (before, settings, moves) => {
          let current = data;
          const actor = current.users.find((item) => item.role === "admin")!;
          const result = await saveCategorySettings(
            before,
            settings,
            moves,
            async (_, next) => {
              assertCategoriesCanBeRemoved(
                current.settings!,
                next.contentCategories!,
                [...current.content, ...current.publishedContent!],
              );
              current = { ...current, settings: next };
              return current;
            },
            async (request) => {
              const result = applyDemoBulk(current, actor, request);
              current = result.data;
              return result;
            },
          );
          setData(result.data);
          return result;
        }}
      />
    </section>
  );
}
