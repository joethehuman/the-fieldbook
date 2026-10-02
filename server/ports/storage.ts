import type { UploadInstruction } from "../../lib/upload-media";
export type { UploadInstruction } from "../../lib/upload-media";

export interface StoragePort {
  createUpload(path: string, mime: string, bytes: number): Promise<UploadInstruction>;
  metadata(path: string): Promise<{ size?: number; mime?: string } | null>;
  signedReadUrl(path: string, expiresIn: number): Promise<string>;
  remove(path: string): Promise<void>;
}
