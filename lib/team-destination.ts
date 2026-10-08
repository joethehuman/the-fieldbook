import { decodedRecordId, recordSegment } from "./record-url";
export function teamHref(personId?: string, name?: string) {
  return personId ? `/team/people/${recordSegment(personId, name)}` : "/team";
}
export function teamPersonId(path: string, people?: readonly { id: string }[]): string | undefined {
  const match = /^\/team\/people\/([^/]+)$/.exec(path);
  if (!match) return undefined;
  try {
    const id = decodedRecordId(match[1], people);
    return id && !id.includes("/") && id.length <= 200 ? id : undefined;
  } catch {
    return undefined;
  }
}
