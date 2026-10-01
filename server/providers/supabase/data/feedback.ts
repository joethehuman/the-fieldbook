import "server-only";
import type { DataStore, FeedbackRecord } from "../../../ports/data";
import { db, check } from "../client";
import { readAll } from "../read-all";

export const feedbackData: Pick<
  DataStore,
  "listFeedback" | "readSavedFeedback" | "saveFeedback"
> = {
  async listFeedback(userId) {
    return await readAll<FeedbackRecord>((from, to) => {
      let query = db().from("fb_feedback").select("*", { count: "exact" });
      if (userId) query = query.eq("user_id", userId);
      return query.order("id").range(from, to);
    });
  },
  async readSavedFeedback(contentId, identity) {
    const query = db()
      .from("fb_feedback")
      .select("rating,comment")
      .eq("content_id", contentId);
    const { data, error } =
      "userId" in identity
        ? await query.eq("user_id", identity.userId).maybeSingle()
        : await query.eq("guest_key", identity.guestKey).maybeSingle();
    check(error);
    return data as Pick<FeedbackRecord, "rating" | "comment"> | null;
  },
  async saveFeedback(record, identity) {
    const { error } = !record.content_id
      ? await db()
          .from("fb_feedback")
          .insert({
            ...record,
            user_id: "userId" in identity ? identity.userId : null,
            guest_key: "guestKey" in identity ? identity.guestKey : null,
          })
      : "userId" in identity
        ? await db()
            .from("fb_feedback")
            .upsert(
              { ...record, user_id: identity.userId },
              { onConflict: "user_id,content_id" },
            )
        : await db()
            .from("fb_feedback")
            .upsert(
              { ...record, user_id: null, guest_key: identity.guestKey },
              { onConflict: "guest_key,content_id" },
            );
    check(error);
  },
};
