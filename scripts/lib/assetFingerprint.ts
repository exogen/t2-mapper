import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { assetIgnoreList } from "./assetIgnore.js";
import {
  knownExtensions,
  metadataFor,
  precompressedMetadataFor,
} from "./assetMetadata.js";
import { BROTLI_QUALITY, shouldPrecompress } from "./precompress.js";

const exec = promisify(execFile);

/** Follow asset symlinks, but reject cycles instead of recursing forever. */
export async function listAssets(source: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(dir: string, prefix: string, ancestors: Set<string>) {
    const real = await fs.realpath(dir);
    if (ancestors.has(real)) throw new Error(`Asset directory cycle: ${dir}`);
    const parents = new Set([...ancestors, real]);
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (assetIgnoreList.ignores(rel)) continue;
      const absolute = path.join(dir, entry.name);
      const stat = entry.isSymbolicLink() ? await fs.stat(absolute) : entry;
      if (stat.isDirectory()) {
        if (!assetIgnoreList.ignores(`${rel}/`)) {
          await visit(absolute, `${rel}/`, parents);
        }
      } else if (stat.isFile()) {
        files.push(rel);
      }
    }
  }
  await visit(source, "", new Set());
  return files.sort();
}

/** Hash only eligible asset paths, contents and their effective upload policy. */
export async function assetFingerprint(
  source: string,
  files: readonly string[],
  precompress: boolean,
): Promise<{ fingerprint: string; policy: string; compression: string }> {
  const tracked = new Map<string, string>();
  // Git already has content hashes for a clean checkout. Modified, untracked
  // and symlinked files are read from disk, also supporting non-Git sources.
  try {
    const options = { cwd: source, maxBuffer: 32 * 1024 * 1024 };
    const [index, changes] = await Promise.all([
      exec("git", ["ls-files", "--stage", "-v", "-z", "--", "."], options),
      exec(
        "git",
        ["diff-files", "--relative", "--name-only", "-z", "--", "."],
        options,
      ),
    ]);
    const dirty = new Set(changes.stdout.split("\0"));
    for (const record of index.stdout.split("\0")) {
      // Only H entries are ordinary tracked files. Lower-case tags and S
      // can hide working-tree edits (assume-unchanged / skip-worktree).
      const match = record.match(/^H 100\d{3} ([a-f0-9]+) 0\t([\s\S]+)$/);
      if (match && !dirty.has(match[2])) tracked.set(match[2], match[1]);
    }
  } catch {
    // No usable Git index: hash the actual files below.
  }
  const hash = createHash("sha256");
  for (const file of files) {
    const metadata = metadataFor(file);
    const brotli =
      precompress && shouldPrecompress(file) ? BROTLI_QUALITY : null;
    const policy = JSON.stringify([
      path.extname(file).toLowerCase(),
      metadata,
      brotli,
    ]);
    let content = tracked.get(file);
    if (!content) {
      const handle = await fs.open(path.join(source, file));
      try {
        const { size } = await handle.stat();
        // Use the same blob hash as Git, so touching a file or staging an
        // unchanged file does not change the fingerprint.
        const digest = createHash("sha1").update(`blob ${size}\0`);
        for await (const chunk of handle.createReadStream())
          digest.update(chunk);
        content = digest.digest("hex");
      } finally {
        await handle.close();
      }
    }
    hash.update(JSON.stringify([file, content, policy]) + "\n");
  }
  return {
    fingerprint: hash.digest("hex"),
    policy: createHash("sha256")
      .update(
        JSON.stringify(
          knownExtensions().map((ext) => [
            ext,
            metadataFor(`asset${ext}`),
            precompressedMetadataFor(`asset${ext}`),
          ]),
        ),
      )
      .digest("hex"),
    compression: precompress ? `br:${BROTLI_QUALITY}` : "none",
  };
}
