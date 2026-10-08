import { request, RequestError } from "./workspace-save";

export type UploadProgress = {
  stage: "preparing" | "uploading" | "verifying";
  uploaded: number;
  total: number;
};
export type UploadInstruction =
  | { url: string; method: "PUT"; headers: Record<string, string> }
  | {
      protocol: "tus";
      url: string;
      headers: Record<string, string>;
      metadata: Record<string, string>;
      chunkSize: number;
    };

/** Use allowlisted categories, never a provider body or a signed request URL. */
export function uploadFailure(status: number, body = "") {
  let code = "";
  try {
    const data = JSON.parse(body);
    code = String(data.error || data.code || "");
    if (Number(data.statusCode) === 413) status = 413;
  } catch {
    /* An HTML or malformed response is still a storage failure. */
  }
  if (
    status === 413 ||
    /EntityTooLarge|PayloadTooLarge|InvalidUploadLength/.test(code)
  )
    return "This file exceeds the upload size limit. Use a smaller file or contact an administrator.";
  if (status === 401 || status === 403)
    return "Your upload permission expired or was denied. Choose the file again to retry.";
  if (status === 404 || status === 410)
    return "This upload expired. Choose the file again to start a new upload.";
  if (status === 409)
    return "This upload conflicts with another transfer. Choose the file again to retry.";
  if (status === 415 || /InvalidMimeType/.test(code))
    return "This file type isn’t supported. Choose an image, MP4 or WebM file.";
  if (status === 429 || status >= 500)
    return "Storage is temporarily unavailable. Wait a moment, then choose the file again.";
  if (!status)
    return "The upload was interrupted. Check your connection and choose the file again.";
  return "The upload was rejected. Check the file type and size, then try again.";
}

export async function transferMedia(
  file: File,
  instruction: UploadInstruction,
  progress?: (uploaded: number) => void,
) {
  if ("protocol" in instruction) {
    const { Upload, DetailedError } = await import("tus-js-client");
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: instruction.url,
        headers: instruction.headers,
        metadata: instruction.metadata,
        chunkSize: instruction.chunkSize,
        uploadDataDuringCreation: true,
        // Resume interrupted chunks in this transfer without persisting signed credentials.
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        retryDelays: [0, 1000, 3000, 5000],
        onShouldRetry(error) {
          const status = error.originalResponse?.getStatus() || 0;
          return (
            !status || [408, 409, 423, 429].includes(status) || status >= 500
          );
        },
        onProgress: (uploaded) => progress?.(uploaded),
        onError(error) {
          const response =
            error instanceof DetailedError ? error.originalResponse : null;
          reject(
            new Error(
              uploadFailure(
                response?.getStatus() || 0,
                response?.getBody() || "",
              ),
            ),
          );
        },
        onSuccess: () => resolve(),
      });
      upload.start();
    });
    return;
  }
  let response: Response;
  try {
    response = await fetch(instruction.url, {
      method: instruction.method,
      headers: instruction.headers,
      body: file,
      credentials: "omit",
    });
  } catch {
    throw new Error(uploadFailure(0));
  }
  if (!response.ok)
    throw new Error(uploadFailure(response.status, await response.text()));
  progress?.(file.size);
}

export async function uploadMediaFile(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
) {
  let last = "";
  const report = (stage: UploadProgress["stage"], uploaded = 0) => {
    const key = `${stage}:${Math.floor((uploaded / file.size) * 100)}`;
    if (key === last) return;
    last = key;
    onProgress?.({ stage, uploaded, total: file.size });
  };
  report("preparing");
  let sign: { id: string; upload: UploadInstruction };
  try {
    sign = await request("/api/upload", {
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    throw new Error(
      error instanceof RequestError
        ? `The upload couldn’t be started. ${error.message}`
        : "The upload couldn’t be started. Try again.",
    );
  }
  report("uploading");
  await transferMedia(file, sign.upload, (uploaded) =>
    report("uploading", uploaded),
  );
  report("verifying", file.size);
  try {
    return (await request("/api/upload", { complete: sign.id })).url as string;
  } catch (error) {
    throw new Error(
      "The upload couldn’t be verified. " +
        (error instanceof RequestError
          ? error.message
          : "Choose the file again to retry."),
    );
  }
}
