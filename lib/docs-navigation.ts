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

// Administration includes saved empty sections as well as legacy content categories.
export function availableDocSections(
  docs: { category: string }[],
  saved: string[] = [],
): string[] {
  return orderedDocCategories(
    [...docs, ...saved.map((category) => ({ category }))],
    saved,
  );
}

export function newDocSection(value: string, sections: string[]): string {
  const name = value.trim();
  if (!name || name.length > 80)
    throw new Error("Enter a section name between 1 and 80 characters.");
  if (sections.some((section) => section.toLowerCase() === name.toLowerCase()))
    throw new Error(
      "A section with this name already exists. Choose it from the list.",
    );
  if (sections.length >= 500)
    throw new Error("You can save up to 500 sections.");
  return name;
}

export function reorderDocSections(
  sections: string[],
  from: number,
  to: number,
): string[] {
  const next = [...sections];
  if (from < 0 || to < 0 || from >= next.length || to >= next.length)
    return next;
  const [name] = next.splice(from, 1);
  next.splice(to, 0, name);
  return next;
}
