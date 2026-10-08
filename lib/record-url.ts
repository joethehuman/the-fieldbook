const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const compactUuid = /(?:^|-)([a-f\d]{32})$/i;
const fullUuid =
  /(?:^|-)([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i;

export function titleSlug(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-");
  return (
    Array.from(words)
      .slice(0, 80)
      .join("")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

/** Titles are presentation; the complete identifier owns lookup and saved state. */
export function recordSegment(id: string, title?: string): string {
  if (title === undefined) return encodeURIComponent(id);
  // Non-UUID identifiers (including demo fixtures) need an unambiguous separator.
  const suffix = uuid.test(id)
    ? id.replaceAll("-", "").toLowerCase()
    : `-${id}`;
  return encodeURIComponent(`${titleSlug(title)}-${suffix}`);
}

export function recordId(
  value: string,
  records?: readonly { id: string }[],
): string | undefined {
  if (!value || value.length > 500 || /[/\\\u0000-\u001f\u007f]/.test(value))
    return undefined;
  // Exact legacy identifiers take precedence over a decorative title suffix.
  if (records?.some((record) => record.id === value)) return value;
  const separator = value.indexOf("--");
  if (records && separator >= 0) {
    const id = value.slice(separator + 2);
    if (records.some((record) => record.id === id)) return id;
  }
  if (uuid.test(value)) return value.toLowerCase();
  const full = fullUuid.exec(value);
  if (full) return full[1].toLowerCase();
  const compact = compactUuid.exec(value)?.[1].toLowerCase();
  if (compact)
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  if (records) {
    const split = value.indexOf("--");
    const id = split < 0 ? value : value.slice(split + 2);
    return records.some((record) => record.id === id) ? id : undefined;
  }
  // A scoped loader can resolve legacy non-UUID records after authorization.
  return value;
}

export function decodeRecordSegment(segment: string): string | undefined {
  try {
    const value = decodeURIComponent(segment);
    return recordId(value) === undefined ? undefined : value;
  } catch {
    return undefined;
  }
}

export function decodedRecordId(
  segment: string,
  records?: readonly { id: string }[],
) {
  const value = decodeRecordSegment(segment);
  return value === undefined ? undefined : recordId(value, records);
}

export function withQuery(
  path: string,
  params: Record<string, string | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) query.set(key, value);
  return path + (query.size ? `?${query}` : "");
}
