import "server-only";
import type { StoragePort, UploadInstruction } from "../../ports/storage";
import { db, check } from "./client";
import { supabaseEnvironment } from "./environment";
import { HttpError } from "../../errors";

const bucket = () => db().storage.from("fieldbook-media");

export const supabaseStorage: StoragePort = {
  async createUpload(path, mime, bytes): Promise<UploadInstruction> {
    const { data, error } = await bucket().createSignedUploadUrl(path, {
      upsert: false,
    });
    if (error) throw new HttpError(503, "Storage could not authorize the upload. Try again; ask an administrator to check storage configuration if it continues.");
    if (bytes > 6 * 1024 * 1024) {
      const { url, key } = supabaseEnvironment();
      const endpoint = new URL(url);
      if (/^[a-z0-9]+\.supabase\.co$/.test(endpoint.hostname))
        endpoint.hostname = endpoint.hostname.replace(".supabase.co", ".storage.supabase.co");
      endpoint.pathname = "/storage/v1/upload/resumable/sign";
      return {
        protocol: "tus",
        url: endpoint.toString(),
        headers: { apikey: key, "x-signature": data!.token, "x-upsert": "false" },
        metadata: { bucketName: "fieldbook-media", objectName: path, contentType: mime, cacheControl: "3600" },
        chunkSize: 6 * 1024 * 1024,
      };
    }
    return {
      url: data!.signedUrl,
      method: "PUT",
      headers: {
        "Content-Type": mime,
        "Cache-Control": "max-age=3600",
        "x-upsert": "false",
      },
    };
  },
  async metadata(path) {
    const slash = path.lastIndexOf("/"),
      folder = path.slice(0, slash),
      name = path.slice(slash + 1);
    const { data, error } = await bucket().list(folder, {
      search: name,
      limit: 1,
    });
    check(error);
    const file = data?.find((entry) => `${folder}/${entry.name}` === path);
    return file
      ? { size: file.metadata?.size, mime: file.metadata?.mimetype }
      : null;
  },
  async signedReadUrl(path, expiresIn) {
    const { data, error } = await bucket().createSignedUrl(path, expiresIn);
    check(error);
    return data!.signedUrl;
  },
  async remove(path) {
    const { error } = await bucket().remove([path]);
    check(error);
  },
};
