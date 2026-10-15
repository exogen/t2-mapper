import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * The relay's multipart uploads (demoUpload.ts) use 8 MiB parts.
 */
export const UPLOAD_PART_BYTES = 8 * 1024 * 1024;

/**
 * An ETag as S3 sends it, without its quotes.
 */
export function unquoteEtag(etag: string | undefined): string {
  return (etag ?? "").replace(/"/g, "");
}

/**
 * Hashes of a local file, and the ETag S3 gives it uploaded whole (its MD5)
 * or in UPLOAD_PART_BYTES parts.
 */
export interface FileEtags {
  md5: string;
  sha256: string;
  multipartEtag: string;
}

export async function fileEtags(file: string): Promise<FileEtags> {
  const md5 = createHash("md5");
  const sha256 = createHash("sha256");
  const partDigests: Buffer[] = [];
  let part = createHash("md5");
  let partBytes = 0;
  for await (const chunk of createReadStream(file)) {
    const bytes = chunk as Buffer;
    md5.update(bytes);
    sha256.update(bytes);
    for (let offset = 0; offset < bytes.length;) {
      const take = Math.min(
        UPLOAD_PART_BYTES - partBytes,
        bytes.length - offset,
      );
      part.update(bytes.subarray(offset, offset + take));
      partBytes += take;
      offset += take;
      if (partBytes === UPLOAD_PART_BYTES) {
        partDigests.push(part.digest());
        part = createHash("md5");
        partBytes = 0;
      }
    }
  }
  if (partBytes > 0) partDigests.push(part.digest());
  const composite = createHash("md5")
    .update(Buffer.concat(partDigests))
    .digest("hex");
  return {
    md5: md5.digest("hex"),
    sha256: sha256.digest("hex"),
    multipartEtag: `${composite}-${partDigests.length}`,
  };
}
