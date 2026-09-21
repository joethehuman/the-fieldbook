import "server-only";
import { db, check } from "./db";
import { HttpError } from "./errors";
import { logoReference } from "@/lib/branding";
export async function readyLogo(reference: string) {
  if (!logoReference.test(reference))
    throw new HttpError(400, "Choose an uploaded PNG, JPG, WebP or GIF logo.");
  const file = reference.split("/").pop()!;
  const { data, error } = await db()
    .from("fb_media")
    .select("path,mime")
    .eq("id", file.split(".")[0])
    .eq("ready", true)
    .maybeSingle();
  check(error);
  if (
    !data ||
    data.path.split("/").pop() !== file ||
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(data.mime)
  )
    throw new HttpError(400, "Choose a ready image upload for the logo.");
  return data;
}
export async function signedBrandingLogoUrl() {
  const { data, error } = await db()
    .from("fb_config")
    .select("logoUrl:settings->>logoUrl")
    .eq("id", true)
    .single();
  check(error);
  if (!data?.logoUrl || !logoReference.test(data.logoUrl))
    throw new HttpError(404, "Logo not found.");
  let media;
  try {
    media = await readyLogo(data.logoUrl);
  } catch (e) {
    if (e instanceof HttpError && e.status === 400)
      throw new HttpError(404, "Logo not found.");
    throw e;
  }
  const { data: signed, error: signError } = await db()
    .storage.from("fieldbook-media")
    .createSignedUrl(media.path, 300);
  check(signError);
  return signed!.signedUrl;
}
