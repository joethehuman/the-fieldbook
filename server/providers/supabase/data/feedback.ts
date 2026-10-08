import "server-only";
import type { DataStore, FeedbackRecord } from "../../../ports/data";
import { db, check } from "../client";
import { readAll } from "../read-all";
import { HttpError } from "../../../errors";

export const feedbackData: Pick<
  DataStore,
  "listFeedback" | "readSavedFeedback" | "saveFeedback" | "deleteFeedback"
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
      .select("id,rating,comment")
      .eq("content_id", contentId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    const { data, error } =
      "userId" in identity
        ? await query.eq("user_id", identity.userId).maybeSingle()
        : await query.eq("guest_key", identity.guestKey).maybeSingle();
    check(error);
    return data as Pick<FeedbackRecord, "id" | "rating" | "comment"> | null;
  },
  async saveFeedback(record, identity) {
    const author =
      "userId" in identity
        ? { user_id: identity.userId, guest_key: null }
        : { user_id: null, guest_key: identity.guestKey };
    const { error } = await db()
      .from("fb_feedback")
      .insert({ ...record, ...author });
    if (!error) return record.id;
    if (error.code !== "23505") check(error);

    // Retries and a submission's optional comment update only its own entry.
    const { id, ...changes } = record;
    let query = db().from("fb_feedback").update(changes).eq("id", id);
    query =
      "userId" in identity
        ? query.eq("user_id", identity.userId)
        : query.eq("guest_key", identity.guestKey);
    query = record.content_id
      ? query.eq("content_id", record.content_id)
      : query.is("content_id", null);
    const updated = await query.select("id").maybeSingle();
    check(updated.error);
    if (!updated.data)
      throw new HttpError(
        409,
        "This feedback entry is unavailable. Reopen the form and try again.",
      );
    return updated.data.id;
  },
  async deleteFeedback(ids) {
    if (!ids.length) return [];
    const { data, error } = await db()
      .from("fb_feedback")
      .delete()
      .in("id", ids)
      .select("id");
    check(error);
    return (data || []).map((row) => row.id);
  },
};
