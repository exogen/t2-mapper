/** Convert raw S3 object keys in a sync report to distinct public URLs. */
export function parseChangedUrls(
  syncOutput: string,
  bucketPrefix: string,
  publicOrigin: string,
): string[] {
  const urls = new Set<string>();
  for (const line of syncOutput.split(/\r?\n/)) {
    const match = line.match(/^(?:upload:.* to |delete: )(s3:\/\/\S.*)$/);
    if (!match || !match[1].startsWith(bucketPrefix)) continue;
    const key = match[1].slice(bucketPrefix.length);
    // These are object keys, not URLs: #, ? and % are literal filename
    // characters and must not become fragments, queries or escape sequences.
    const url = new URL(publicOrigin);
    url.pathname += key.split("/").map(encodeURIComponent).join("/");
    urls.add(url.href);
  }
  return [...urls];
}
