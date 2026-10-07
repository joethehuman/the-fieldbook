import { RequestError } from "./workspace-save";

const guestKey = "fieldbook.guest-progress.v1";
type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Best-effort restoration; this optional flow must never interrupt the reader. */
export async function restoreGuestProgress(
  storage: BrowserStorage,
  send: (body: unknown) => Promise<unknown>,
): Promise<number> {
  let saved = 0;
  try {
    const raw = storage.getItem(guestKey);
    if (!raw) return saved;
    let entries: unknown;
    try {
      entries = JSON.parse(raw);
    } catch {
      entries = null;
    }
    if (!Array.isArray(entries)) {
      if (storage.getItem(guestKey) === raw) storage.removeItem(guestKey);
      return saved;
    }

    for (const entry of entries) {
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        try {
          await send({
            contentId: record.content_id,
            version: record.version,
            lessons: record.lessons,
            answers: record.guestAnswers,
            selections: record.guestSelections,
            complete: record.passed,
            guestImport: true,
          });
          saved++;
        } catch (error) {
          // Invalid, unavailable, and superseded records cannot be restored.
          // Auth, rate limits, and connection/server failures keep records for later.
          if (
            !(error instanceof RequestError) ||
            ![400, 404, 409].includes(error.status)
          )
            break;
        }
      }

      // Preserve any browser progress changed while the request was in flight.
      const current = JSON.parse(storage.getItem(guestKey) || "[]");
      if (!Array.isArray(current)) break;
      const remaining = current.filter(
        (candidate) => JSON.stringify(candidate) !== JSON.stringify(entry),
      );
      if (remaining.length)
        storage.setItem(guestKey, JSON.stringify(remaining));
      else storage.removeItem(guestKey);
    }
  } catch {
    // Browsers may deny storage access. Guest history is optional.
  }
  return saved;
}
