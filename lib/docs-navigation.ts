import type { Content } from "./types";

export type DocSection = {
  id: string;
  name: string;
  parentId?: string;
  // Retain the original path for old draft and published snapshots.
  legacyCategory?: string;
  legacyFolder?: string;
};
export type DocLink = Pick<
  Content,
  "id" | "title" | "category" | "folder" | "kind" | "status"
> & { sectionId?: string; sectionOrder?: number };
export type DocBranch = {
  id: string;
  name: string;
  docs: DocLink[];
  folders: DocBranch[];
};

const legacyId = (category: string, folder = "") =>
  "legacy:" + encodeURIComponent(category) + ":" + encodeURIComponent(folder);
const parts = (folder: string) =>
  folder
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

export function legacySectionConflict(docs: DocLink[]): string | null {
  const invalid = docs.find((doc) => parts(doc.folder).length > 1);
  return invalid
    ? 'Doc "' +
        invalid.title +
        '" uses folder "' +
        invalid.folder +
        '", which is deeper than two Docs section levels. Move it before saving the hierarchy.'
    : null;
}

// Deterministic legacy IDs resolve old published snapshots without rewriting
// documents. Once saved, the aliases stay stable through renames and moves.
export function availableDocSections(
  docs: DocLink[],
  saved: string[] = [],
  configured: DocSection[] = [],
): DocSection[] {
  const result = [...configured];
  const aliases = new Map(
    result
      .filter((section) => section.legacyCategory)
      .map(
        (section) =>
          [
            legacyId(section.legacyCategory!, section.legacyFolder ?? ""),
            section.id,
          ] as const,
      ),
  );
  const add = (category: string, folder = "") => {
    if (!category.trim()) return undefined;
    const alias = legacyId(category, folder);
    if (aliases.has(alias)) return aliases.get(alias);
    const parentId = folder ? add(category) : undefined;
    aliases.set(alias, alias);
    result.push({
      id: alias,
      name: folder || category,
      ...(parentId ? { parentId } : {}),
      legacyCategory: category,
      ...(folder ? { legacyFolder: folder } : {}),
    });
    return alias;
  };
  saved.forEach((category) => add(category));
  const discovered = [...docs].sort((a, b) =>
    a.category.localeCompare(b.category),
  );
  discovered.forEach((doc) => {
    if (doc.sectionId) {
      if (result.some((section) => section.id === doc.sectionId)) return;
      // A concurrent settings edit can remove a section after a document
      // save begins. Keep that document visible until it is moved explicitly.
      const path = parts(doc.folder);
      const parentId = path.length === 1 ? add(doc.category) : undefined;
      const parent = result.find((section) => section.id === parentId);
      result.push({
        id: doc.sectionId,
        name: path.length === 1 ? path[0] : doc.category || "Untitled section",
        ...(parent && !parent.parentId ? { parentId } : {}),
      });
      return;
    }
    add(doc.category);
    const path = parts(doc.folder);
    if (path.length === 1) add(doc.category, path[0]);
  });
  return result;
}

export function validateDocSections(sections: DocSection[]): void {
  if (sections.length > 500)
    throw new Error("You can save up to 500 sections.");
  const ids = new Set<string>();
  const siblings = new Set<string>();
  const aliases = new Set<string>();
  for (const section of sections) {
    if (!section.id || section.id.length > 1500 || ids.has(section.id))
      throw new Error("Docs sections need unique, stable IDs.");
    ids.add(section.id);
    if (
      !section.name.trim() ||
      section.name !== section.name.trim() ||
      section.name.length > 80
    )
      throw new Error("Enter a section name between 1 and 80 characters.");
    const sibling =
      (section.parentId || "") + ":" + section.name.toLocaleLowerCase();
    if (siblings.has(sibling))
      throw new Error("Sections under the same parent need different names.");
    siblings.add(sibling);
    if (section.legacyCategory) {
      const alias = legacyId(
        section.legacyCategory,
        section.legacyFolder ?? "",
      );
      if (aliases.has(alias))
        throw new Error("Legacy Docs section paths must be unique.");
      aliases.add(alias);
    }
  }
  for (const section of sections) {
    if (!section.parentId) continue;
    const parent = sections.find((item) => item.id === section.parentId);
    if (!parent) throw new Error("Choose an existing top-level parent.");
    if (parent.id === section.id || parent.parentId)
      throw new Error(
        "Docs sections support exactly two levels; cycles are not allowed.",
      );
  }
}

export function createDocSection(
  sections: DocSection[],
  name: string,
  parentId?: string,
  id = crypto.randomUUID(),
): DocSection[] {
  const next = [
    ...sections,
    { id, name: name.trim(), ...(parentId ? { parentId } : {}) },
  ];
  validateDocSections(next);
  return next;
}
export function renameDocSection(
  sections: DocSection[],
  id: string,
  name: string,
) {
  if (!sections.some((section) => section.id === id))
    throw new Error("Section not found.");
  const next = sections.map((section) =>
    section.id === id ? { ...section, name: name.trim() } : section,
  );
  validateDocSections(next);
  return next;
}
export function moveDocSection(
  sections: DocSection[],
  id: string,
  parentId?: string,
) {
  if (!sections.some((section) => section.id === id))
    throw new Error("Section not found.");
  if (parentId && sections.some((section) => section.parentId === id))
    throw new Error(
      "Move this section's subsections before making it a subsection.",
    );
  const next = sections.map((section) =>
    section.id === id
      ? { ...section, parentId: parentId || undefined }
      : section,
  );
  validateDocSections(next);
  const moved = next.find((section) => section.id === id)!;
  return [...next.filter((section) => section.id !== id), moved];
}
export function reorderDocSection(
  sections: DocSection[],
  id: string,
  offset: number,
) {
  const index = sections.findIndex((section) => section.id === id);
  if (index < 0) return sections;
  const siblings = sections
    .map((section, position) =>
      section.parentId === sections[index].parentId ? position : -1,
    )
    .filter((position) => position >= 0);
  const target = siblings[siblings.indexOf(index) + offset];
  if (target === undefined) return sections;
  const next = [...sections];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function sectionForDoc(
  doc: DocLink,
  sections: DocSection[],
): DocSection | undefined {
  if (doc.sectionId)
    return sections.find((section) => section.id === doc.sectionId);
  const folder = parts(doc.folder)[0] || "";
  return sections.find(
    (section) =>
      section.legacyCategory === doc.category &&
      (section.legacyFolder ?? "") === folder,
  );
}
export function deleteDocSection(
  sections: DocSection[],
  id: string,
  docs: DocLink[],
) {
  if (sections.some((section) => section.parentId === id))
    throw new Error("Move subsections before deleting this section.");
  if (docs.some((doc) => sectionForDoc(doc, sections)?.id === id))
    throw new Error("Move this section's documents before deleting it.");
  return sections.filter((section) => section.id !== id);
}
export function sectionPath(
  section: DocSection,
  sections: DocSection[],
  separator = " → ",
) {
  const parent = sections.find((item) => item.id === section.parentId);
  return parent ? parent.name + separator + section.name : section.name;
}
export function docSections(
  docs: DocLink[],
  saved: string[] = [],
  configured: DocSection[] = [],
): DocBranch[] {
  const published = docs.filter(
    (doc) => doc.kind === "doc" && doc.status === "published",
  );
  // An older installation may have a deeper folder path. Keep its existing
  // reader tree until an operator resolves the explicit settings conflict.
  if (legacySectionConflict(published)) {
    const categories = [...new Set(published.map((doc) => doc.category))];
    const ordered = [
      ...saved.filter((name) => categories.includes(name)),
      ...categories
        .filter((name) => !saved.includes(name))
        .sort((a, b) => a.localeCompare(b)),
    ];
    const oldBranch = (
      name: string,
      category: string,
      subset: DocLink[],
      depth: number,
      lineage: string,
    ): DocBranch => {
      const children = [
        ...new Set(
          subset.map((doc) => parts(doc.folder)[depth]).filter(Boolean),
        ),
      ];
      return {
        id: lineage,
        name,
        docs: subset.filter((doc) => parts(doc.folder).length === depth),
        folders: children.map((child) =>
          oldBranch(
            child,
            category,
            subset.filter((doc) => parts(doc.folder)[depth] === child),
            depth + 1,
            lineage + "/" + encodeURIComponent(child),
          ),
        ),
      };
    };
    return ordered.map((category) =>
      oldBranch(
        category,
        category,
        published.filter((doc) => doc.category === category),
        0,
        legacyId(category),
      ),
    );
  }
  const sections = availableDocSections(published, saved, configured);
  const branch = (section: DocSection): DocBranch => ({
    id: section.id,
    name: section.name,
    docs: published
      .filter((doc) => sectionForDoc(doc, sections)?.id === section.id)
      .sort((a, b) => (a.sectionOrder || 0) - (b.sectionOrder || 0)),
    folders: sections
      .filter((item) => item.parentId === section.id)
      .map(branch),
  });
  return sections
    .filter((section) => !section.parentId)
    .map(branch)
    .filter(
      (section) =>
        section.docs.length ||
        section.folders.some((child) => child.docs.length),
    );
}
export function orderedDocs(
  docs: DocLink[],
  saved: string[] = [],
  configured: DocSection[] = [],
): DocLink[] {
  const flatten = (branch: DocBranch): DocLink[] => [
    ...branch.docs,
    ...branch.folders.flatMap(flatten),
  ];
  return docSections(docs, saved, configured).flatMap(flatten);
}
export function orderedDocCategories(
  docs: DocLink[],
  saved: string[] = [],
  configured: DocSection[] = [],
) {
  return docSections(docs, saved, configured).map((section) => section.name);
}
