/**
 * Keep the game assets on the relay's volume in step with git, so the CRC
 * check reads exactly what the branch has rather than whatever was copied
 * up by hand. Runs before the relay starts (see relay/Dockerfile); a
 * failure is logged and leaves the previous checkout in place.
 *
 * The checkout is shallow, blobless, and sparse: only the shape files the
 * CRC needs are ever fetched (a few MB), and an update transfers just the
 * objects that changed. Run it on demand with
 * `fly ssh console -C "node --import=tsx/esm relay/syncAssets.ts"`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const REPO_URL =
  process.env.ASSETS_REPO_URL || "https://github.com/exogen/t2-mapper.git";
const REPO_DIR = process.env.ASSETS_REPO_DIR || "/data/t2-mapper";
const REPO_REF = process.env.ASSETS_REPO_REF || "main";
/** Comma-separated gitignore-style patterns (non-cone sparse checkout). */
const SPARSE_PATTERNS = (
  process.env.ASSETS_SPARSE_PATTERNS || "docs/base/**/*.dts"
).split(",");

function git(args: string[], cwd?: string): void {
  execFileSync("git", args, { stdio: "inherit", cwd });
}

const cloned = await fs.access(path.join(REPO_DIR, ".git")).then(
  () => true,
  () => false,
);
try {
  if (!cloned) {
    await fs.mkdir(path.dirname(REPO_DIR), { recursive: true });
    git([
      "clone",
      "--depth=1",
      "--filter=blob:none",
      "--no-checkout",
      "--branch",
      REPO_REF,
      REPO_URL,
      REPO_DIR,
    ]);
  } else {
    git(["fetch", "--depth=1", "origin", REPO_REF], REPO_DIR);
  }
  // The pattern set is reapplied every time so a change takes effect on
  // update; the hard reset materializes the sparse tree (and discards any
  // stray edits on the volume).
  git(["sparse-checkout", "set", "--no-cone", ...SPARSE_PATTERNS], REPO_DIR);
  git(["reset", "--hard", cloned ? "FETCH_HEAD" : "HEAD"], REPO_DIR);
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: REPO_DIR,
    encoding: "utf8",
  }).trim();
  console.log(`Game assets at ${REPO_DIR}: ${REPO_REF} @ ${head}`);
} catch (err) {
  console.error(
    `Game asset sync failed${cloned ? " (keeping the existing checkout)" : ""}: ${String(err)}`,
  );
  process.exitCode = 1;
}
