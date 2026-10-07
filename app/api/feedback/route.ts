import { actor, sameOrigin, errorResponse, HttpError } from "@server/auth";
import { data as dataStore } from "@server/data";
import { clientAddress } from "@server/deployment";
import { canRead, getContent } from "@server/content";
import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
const guestCookie = "fb_guest_feedback";
const guestToken = (req: NextRequest) => {
  const value = req.cookies.get(guestCookie)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function GET(req: NextRequest) {
  try {
    const user = await actor();
    const id = z.uuid().parse(new URL(req.url).searchParams.get("contentId"));
    await getContent(id, user);
    const token = user ? null : guestToken(req);
    const data = user
      ? await dataStore().readSavedFeedback(id, { userId: user.id })
      : token
        ? await dataStore().readSavedFeedback(id, { guestKey: hash(token) })
        : null;
    return Response.json(
      { saved: data || null },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
    );
  } catch (e) {
    return errorResponse(e, "api/feedback");
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await actor();
    const a = z
      .object({
        contentId: z.uuid().optional(),
        submissionId: z.uuid().optional(),
        rating: z.enum(["up", "down"]),
        comment: z.string().max(5000),
      })
      .parse(await req.json());
    const existingToken = user ? null : guestToken(req);
    const token = user
      ? null
      : existingToken || randomBytes(32).toString("hex");
    if (token) {
      const source = clientAddress(req) || token;
      const allowed = await dataStore().consumeRateLimit(
        `guest-feedback:${hash(source)}`,
        30,
        3600,
      );
      if (!allowed)
        throw new HttpError(429, "Please wait before sending more feedback.");
    }
    const c = a.contentId ? await getContent(a.contentId, user) : null;
    if (!c) await canRead(user);
    const identity = user ? { userId: user.id } : { guestKey: hash(token!) };
    // Older open readers omit a submission ID. Keep their rating/comment pair
    // together while new readers explicitly identify each new interaction.
    const legacy =
      c && !a.submissionId
        ? await dataStore().readSavedFeedback(c.id, identity)
        : null;
    const record = {
      id: a.submissionId || legacy?.id || crypto.randomUUID(),
      content_id: c?.id ?? null,
      version: c?.version ?? null,
      rating: a.rating,
      comment: a.comment,
      updated_at: new Date().toISOString(),
    };
    const id = await dataStore().saveFeedback(record, identity);
    const response = NextResponse.json(
      { saved: true, id },
      { headers: { "Cache-Control": "no-store" } },
    );
    if (token && !existingToken)
      response.cookies.set(guestCookie, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    return response;
  } catch (e) {
    return errorResponse(e, "api/feedback");
  }
}
