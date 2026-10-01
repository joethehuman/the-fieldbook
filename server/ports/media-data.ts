export type MediaUpload = {
  id: string;
  path: string;
  filename: string;
  mime: string;
  bytes: number;
  owner: string;
};

export interface MediaDataPort {
  allowUpload(owner: string): Promise<boolean>;
  registerUpload(upload: MediaUpload): Promise<void>;
  findOwnedUpload(id: string, owner: string): Promise<MediaUpload>;
  markReady(id: string): Promise<void>;
  findReadyPath(id: string): Promise<string | null>;
  hasPublishedDocumentReference(reference: string): Promise<boolean>;
}
