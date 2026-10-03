export function teamHref(personId?: string) {
  return personId ? `/team/people/${encodeURIComponent(personId)}` : "/team";
}
export function teamPersonId(path: string): string | undefined {
  const match = /^\/team\/people\/([^/]+)$/.exec(path);
  if (!match) return undefined;
  try {
    const id = decodeURIComponent(match[1]);
    return id && !id.includes("/") && id.length <= 200 ? id : undefined;
  } catch {
    return undefined;
  }
}
