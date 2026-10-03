import type { SiteSettings } from "./settings";
import type { Workspace } from "./store";
import { equalJson } from "./equal-json";
import { RequestError } from "./workspace-save";

/** A settings form makes one atomic, revision-checked write. Never replay it automatically. */
export function createSettingsSaver(
  send: (path: string, body: unknown) => Promise<unknown>,
  load: () => Promise<Workspace>,
) {
  return async (
    before: Workspace,
    settings: SiteSettings,
  ): Promise<Workspace> => {
    const current = await load();
    // A previous response may have been lost. Already-saved settings need no retry.
    if (equalJson(current.settings, settings)) return current;
    if (!equalJson(current.settings, before.settings))
      throw new RequestError(
        "Settings changed elsewhere. Reload this page before saving. Your edits remain open.",
        409,
      );
    let saved: { revision: number; settings?: SiteSettings };
    try {
      saved = (await send("/api/settings", {
        settings,
        expected: current.revision,
      })) as typeof saved;
    } catch (error) {
      // A read can confirm a lost response without making another write.
      try {
        const latest = await load();
        if (equalJson(latest.settings, settings)) return latest;
      } catch {
        /* Keep the draft and recheck on the next explicit Save. */
      }
      throw new Error(
        (error instanceof RequestError
          ? error.message
          : "Settings could not be saved. Check your connection and try again.") +
          " Your edits remain open.",
      );
    }
    // The API acknowledges the canonical settings and revision. A failed follow-up
    // read must not turn a confirmed save into an unsaved-changes warning.
    const acknowledged = {
      ...current,
      revision: saved.revision,
      settings: saved.settings ?? settings,
    };
    try {
      return await load();
    } catch {
      return acknowledged;
    }
  };
}
