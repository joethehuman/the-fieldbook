/** A short-lived instruction for uploading the raw file body directly to storage. */
export type UploadInstruction = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
};

export interface StoragePort {
  createUpload(path: string, mime: string): Promise<UploadInstruction>;
  metadata(path: string): Promise<{ size?: number; mime?: string } | null>;
  signedReadUrl(path: string, expiresIn: number): Promise<string>;
  remove(path: string): Promise<void>;
}
