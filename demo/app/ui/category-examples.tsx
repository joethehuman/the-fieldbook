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

/** The real panel, with a published item, a draft, an empty category and two independent lists. */
export function CategoryExamples() {
  const [data, setData] = useState(() => {
    const initial = withPublishedSnapshots(freshWorkspace());
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
    <section className="grid gap-4">
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
