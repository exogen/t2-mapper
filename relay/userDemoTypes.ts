/** Shared limits and HTTP contract for the authenticated demo library. */
export const USER_DEMO_UPLOAD_PATH = "/api/demo-uploads";
export const MAX_USER_DEMO_BYTES = 50_000_000;
export const MAX_USER_DEMO_DECOMPRESSED_BYTES = 128_000_000;
export const MAX_USER_DEMO_SIDECAR_BYTES = 128_000_000;
export const MAX_USER_DEMO_METADATA_BYTES = 1_000_000;
export const MAX_USER_DEMO_STORAGE_BYTES = 8_000_000_000;
export const MAX_USER_DEMOS = 1_000;

export type UserDemoUploadState =
  | "receiving"
  | "queued"
  | "processing"
  | "publishing"
  | "ready"
  | "deleting"
  | "failed";

export interface UserDemoUpload {
  id: string;
  originalFilename: string;
  /** Relative published demo key, named from the recording once processed. */
  filename: string | null;
  state: UserDemoUploadState;
  bytes: number;
  storedBytes: number;
  recordedAt: string | null;
  createdAt: string;
  error: string | null;
}

export interface UserDemoUploadList {
  demos: UserDemoUpload[];
  usage: { bytes: number; count: number };
  limits: {
    maxDemoBytes: number;
    maxExpandedBytes: number;
    maxStorageBytes: number;
    maxDemos: number;
  };
}

export interface UserDemoUploadResponse {
  demo: UserDemoUpload;
  duplicate?: true;
}
