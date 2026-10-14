import type { Content } from "./types";

export type DocNavigationItem = { kind: "doc" | "section"; id: string };
export const navigationItemKey = (item: DocNavigationItem) =>
  `${item.kind}:${item.id}`;

export type DocSection = {
  id: string;
  name: string;
  parentId?: string;
  /** Navigation order only; document draft and publication snapshots stay intact. */
  docOrder?: string[];
  /** Mixed sibling order; absent settings retain the original Docs-first order. */
  itemOrder?: DocNavigationItem[];
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
  itemOrder?: DocNavigationItem[];
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
      section.itemOrder &&
      (section.itemOrder.length > 5500 ||
        new Set(section.itemOrder.map(navigationItemKey)).size !==
          section.itemOrder.length ||
        section.itemOrder.some(
          (item) =>
            !["doc", "section"].includes(item.kind) ||
            !item.id ||
            item.id.length > (item.kind === "doc" ? 80 : 1500),
        ))
    )
      throw new Error(
        "Navigation order needs unique document or subsection IDs (up to 5,500 per section).",
      );
    if (
      section.docOrder &&
      (section.docOrder.length > 5000 ||
        new Set(section.docOrder).size !== section.docOrder.length ||
        section.docOrder.some((id) => !id || id.length > 80))
    )
      throw new Error(
        "Document order needs unique document IDs (up to 5,000 per section).",
      );
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
      "Move this section’s subsections elsewhere before changing its level.",
    );
  const next = sections.map((section) => {
    if (section.id === id)
      return { ...section, parentId: parentId || undefined };
    if (!section.itemOrder) return section;
    const remaining = section.itemOrder.filter(
      (item) => item.kind !== "section" || item.id !== id,
    );
    return {
      ...section,
      itemOrder:
        section.id === parentId
          ? [...remaining, { kind: "section" as const, id }]
          : remaining,
    };
  });
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
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
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

export function orderedSectionDocs(
  docs: DocLink[],
  sections: DocSection[],
  sectionId: string,
): DocLink[] {
  const order =
    sections.find((section) => section.id === sectionId)?.docOrder || [];
  const positions = new Map(order.map((id, index) => [id, index]));
  return docs
    .filter((doc) => sectionForDoc(doc, sections)?.id === sectionId)
    .sort((a, b) => {
      const first = positions.get(a.id),
        second = positions.get(b.id);
      if (first !== undefined || second !== undefined)
        return (first ?? order.length) - (second ?? order.length);
      return (a.sectionOrder || 0) - (b.sectionOrder || 0);
    });
}

export function orderedSectionItems(
  docs: DocLink[],
  sections: DocSection[],
  sectionId: string,
): DocNavigationItem[] {
  const items: DocNavigationItem[] = [
    ...orderedSectionDocs(docs, sections, sectionId).map((doc) => ({
      kind: "doc" as const,
      id: doc.id,
    })),
    ...sections
      .filter((section) => section.parentId === sectionId)
      .map((section) => ({ kind: "section" as const, id: section.id })),
  ];
  const order =
    sections.find((section) => section.id === sectionId)?.itemOrder || [];
  const positions = new Map(
    order.map((item, index) => [navigationItemKey(item), index]),
  );
  return items.sort(
    (a, b) =>
      (positions.get(navigationItemKey(a)) ?? order.length) -
      (positions.get(navigationItemKey(b)) ?? order.length),
  );
}

function setSectionItemOrder(
  sections: DocSection[],
  sectionId: string,
  itemOrder: DocNavigationItem[],
): DocSection[] {
  const childPositions = new Map(
    itemOrder
      .filter((item) => item.kind === "section")
      .map((item, index) => [item.id, index]),
  );
  const children = sections
    .filter((section) => section.parentId === sectionId)
    .sort(
      (a, b) =>
        (childPositions.get(a.id) ?? childPositions.size) -
        (childPositions.get(b.id) ?? childPositions.size),
    );
  let childIndex = 0;
  const next = sections.map((section) =>
    section.id === sectionId
      ? {
          ...section,
          itemOrder,
          docOrder: itemOrder
            .filter((item) => item.kind === "doc")
            .map((item) => item.id),
        }
      : section.parentId === sectionId
        ? children[childIndex++]
        : section,
  );
  validateDocSections(next);
  return next;
}

export function reorderSectionItem(
  sections: DocSection[],
  docs: DocLink[],
  sectionId: string,
  item: DocNavigationItem,
  targetIndex: number,
): DocSection[] {
  const items = orderedSectionItems(docs, sections, sectionId);
  const from = items.findIndex(
    (candidate) => navigationItemKey(candidate) === navigationItemKey(item),
  );
  if (
    from < 0 ||
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= items.length ||
    from === targetIndex
  )
    return sections;
  items.splice(from, 1);
  items.splice(targetIndex, 0, item);
  return setSectionItemOrder(sections, sectionId, items);
}

export function reorderDocInSection(
  sections: DocSection[],
  docs: DocLink[],
  sectionId: string,
  id: string,
  targetIndex: number,
): DocSection[] {
  const ordered = orderedSectionDocs(docs, sections, sectionId).map(
    (doc) => doc.id,
  );
  const from = ordered.indexOf(id);
  if (
    from < 0 ||
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= ordered.length ||
    from === targetIndex
  )
    return sections;
  ordered.splice(from, 1);
  ordered.splice(targetIndex, 0, id);
  if (sections.find((section) => section.id === sectionId)?.itemOrder) {
    let index = 0;
    return setSectionItemOrder(
      sections,
      sectionId,
      orderedSectionItems(docs, sections, sectionId).map((item) =>
        item.kind === "doc" ? { kind: "doc", id: ordered[index++] } : item,
      ),
    );
  }
  const next = sections.map((section) =>
    section.id === sectionId ? { ...section, docOrder: ordered } : section,
  );
  validateDocSections(next);
  return next;
}

/** Stage placement and order together. The save operation applies metadata only. */
export function moveDocumentsInNavigation(
  sections: DocSection[],
  docs: DocLink[],
  ids: string[],
  destination: string,
  targetIndex?: number,
): DocSection[] {
  if (!sections.some((section) => section.id === destination))
    throw new Error("Choose an existing Docs section.");
  const moving = new Set(ids);
  if (!ids.length || ids.some((id) => !docs.some((doc) => doc.id === id)))
    throw new Error("A document is unavailable. Reload before moving it.");
  const sources = new Set(
    docs
      .filter((doc) => moving.has(doc.id))
      .map((doc) => sectionForDoc(doc, sections)?.id),
  );
  const target = orderedSectionDocs(docs, sections, destination)
    .map((doc) => doc.id)
    .filter((id) => !moving.has(id));
  target.splice(
    Math.max(0, Math.min(targetIndex ?? target.length, target.length)),
    0,
    ...ids,
  );
  const next = sections.map((section) => {
    if (section.id !== destination && !sources.has(section.id)) return section;
    const docOrder =
      section.id === destination
        ? target
        : orderedSectionDocs(docs, sections, section.id)
            .map((doc) => doc.id)
            .filter((id) => !moving.has(id));
    if (!section.itemOrder) return { ...section, docOrder };
    const itemOrder = orderedSectionItems(docs, sections, section.id).filter(
      (item) => item.kind !== "doc" || !moving.has(item.id),
    );
    if (section.id === destination) {
      const followingDoc = target[target.indexOf(ids[0]) + ids.length];
      const index =
        targetIndex === undefined || !followingDoc
          ? itemOrder.length
          : itemOrder.findIndex(
              (item) => item.kind === "doc" && item.id === followingDoc,
            );
      itemOrder.splice(
        index < 0 ? itemOrder.length : index,
        0,
        ...ids.map((id) => ({ kind: "doc" as const, id })),
      );
    }
    return {
      ...section,
      itemOrder,
      docOrder: itemOrder
        .filter((item) => item.kind === "doc")
        .map((item) => item.id),
    };
  });
  validateDocSections(next);
  return next;
}
export function deleteDocSection(
  sections: DocSection[],
  id: string,
  docs: DocLink[],
) {
  if (sections.some((section) => section.parentId === id))
    throw new Error("Move this section’s items elsewhere before deleting it.");
  if (docs.some((doc) => sectionForDoc(doc, sections)?.id === id))
    throw new Error("Move this section’s items elsewhere before deleting it.");
  return sections
    .filter((section) => section.id !== id)
    .map((section) =>
      section.itemOrder
        ? {
            ...section,
            itemOrder: section.itemOrder.filter(
              (item) => item.kind !== "section" || item.id !== id,
            ),
          }
        : section,
    );
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
    docs: orderedSectionDocs(published, sections, section.id),
    folders: sections
      .filter((item) => item.parentId === section.id)
      .map(branch),
    itemOrder: orderedSectionItems(published, sections, section.id),
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
export function orderedBranchItems(
  branch: DocBranch,
): ({ kind: "doc"; doc: DocLink } | { kind: "section"; section: DocBranch })[] {
  const docs = new Map(branch.docs.map((doc) => [doc.id, doc]));
  const folders = new Map(branch.folders.map((folder) => [folder.id, folder]));
  const order = branch.itemOrder || [
    ...branch.docs.map((doc) => ({ kind: "doc" as const, id: doc.id })),
    ...branch.folders.map((folder) => ({
      kind: "section" as const,
      id: folder.id,
    })),
  ];
  return order.flatMap(
    (
      item,
    ): (
      { kind: "doc"; doc: DocLink } | { kind: "section"; section: DocBranch }
    )[] => {
      if (item.kind === "doc") {
        const doc = docs.get(item.id);
        return doc ? [{ kind: "doc", doc }] : [];
      }
      const section = folders.get(item.id);
      return section ? [{ kind: "section", section }] : [];
    },
  );
}

export function orderedDocs(
  docs: DocLink[],
  saved: string[] = [],
  configured: DocSection[] = [],
): DocLink[] {
  const flatten = (branch: DocBranch): DocLink[] =>
    orderedBranchItems(branch).flatMap((item) =>
      item.kind === "doc" ? [item.doc] : flatten(item.section),
    );
  return docSections(docs, saved, configured).flatMap(flatten);
}
export function orderedDocCategories(
  docs: DocLink[],
  saved: string[] = [],
  configured: DocSection[] = [],
) {
  return docSections(docs, saved, configured).map((section) => section.name);
}
