import type { Content } from "./types";
import { contentSignature } from "./demo-publication";

export type SaveIntent = "draft" | "published";

/** One writer per open document. Acknowledgements never replace newer edits.
 * Failures stop the queue until the author explicitly reviews/reloads a saved copy.
 */
export function createDraftSaveQueue(options: {
  initial: Content;
  idleMs?: number;
  read: () => Content;
  save: (snapshot: Content, intent: SaveIntent) => Promise<Content>;
  acknowledge: (saved: Content, snapshot: Content, intent: SaveIntent) => void;
  failed: (error: unknown) => void;
}) {
  let baseline = options.initial;
  let running: Promise<boolean> | undefined;
  let blocked = false;
  let publishRequested = false;
  let editedAt = 0;
  const dirty = () =>
    contentSignature(options.read()) !== contentSignature(baseline);
  function flush(intent: SaveIntent = "draft"): Promise<boolean> {
    if (blocked) return Promise.resolve(false);
    if (intent === "published") publishRequested = true;
    if (running) return running;
    running = (async () => {
      try {
        while (dirty() || publishRequested) {
          // Continue coalescing while a writer is slow; never produce one audit
          // entry per network round trip during uninterrupted typing.
          while (
            !publishRequested &&
            dirty() &&
            Date.now() < editedAt + (options.idleMs || 0)
          )
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                editedAt + (options.idleMs || 0) - Date.now(),
              ),
            );
          if (!dirty() && !publishRequested) break;
          const nextIntent = publishRequested ? "published" : "draft";
          publishRequested = false;
          const snapshot = options.read();
          const saved = await options.save(
            { ...snapshot, revision: baseline.revision },
            nextIntent,
          );
          baseline = saved;
          options.acknowledge(saved, snapshot, nextIntent);
        }
        return true;
      } catch (error) {
        blocked = true;
        publishRequested = false;
        options.failed(error);
        return false;
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  }
  return {
    flush,
    dirty,
    markEdited() {
      editedAt = Date.now();
    },
    get blocked() {
      return blocked;
    },
    reset(saved: Content) {
      baseline = saved;
      blocked = false;
      publishRequested = false;
    },
  };
}
