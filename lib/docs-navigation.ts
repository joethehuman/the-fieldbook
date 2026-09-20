// Saved sections come first; new sections append in a stable alphabetical order.
// Only categories present in the reader's visible documents are returned.
export function orderedDocCategories(
  docs: { category: string }[],
  saved: string[] = [],
): string[] {
  const available = new Set(docs.map((d) => d.category));
  const ordered = [...new Set(saved)].filter((name) => available.has(name));
  const chosen = new Set(ordered);
  return [
    ...ordered,
    ...[...available]
      .filter((name) => !chosen.has(name))
      .sort((a, b) => a.localeCompare(b)),
  ];
}
