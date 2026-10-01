import "server-only";
import type { StoragePort } from "../../ports/storage";
import { db, check } from "./client";

const bucket = () => db().storage.from("fieldbook-media");

export const supabaseStorage: StoragePort = {
  async createUpload(path, mime) {
    const { data, error } = await bucket().createSignedUploadUrl(path, {
      upsert: false,
    });
    check(error);
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
