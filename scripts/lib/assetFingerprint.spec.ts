import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { assetFingerprint, listAssets } from "./assetFingerprint.js";

const exec = promisify(execFile);

describe("asset fingerprint scope", () => {
  let root: string;
  let source: string;
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  const fingerprint = async () =>
    assetFingerprint(source, await listAssets(source), true);
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "asset-fingerprint-test-"));
    source = path.join(root, "docs/base");
    await fs.mkdir(source, { recursive: true });
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(source, "tree.dts"), "tree");
    await fs.writeFile(path.join(root, "src/app.ts"), "app");
    // Only this disposable fixture's index is modified; no commits needed.
    await git("init", "--quiet");
    await git("add", ".");
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("ignores app, generated docs and other repository changes, staged or unstaged", async () => {
    const before = await fingerprint();
    await fs.writeFile(path.join(root, "src/app.ts"), "changed");
    await fs.writeFile(path.join(root, "docs/index.html"), "built app");
    await fs.writeFile(path.join(root, "package-lock.json"), "unrelated");
    expect(await fingerprint()).toEqual(before);
    await git("add", ".");
    expect(await fingerprint()).toEqual(before);
  });

  it("detects staged and unstaged same-size asset edits, retaining the same hash after staging", async () => {
    const before = await fingerprint();
    await fs.writeFile(path.join(source, "tree.dts"), "TREE");
    const dirty = await fingerprint();
    expect(dirty.fingerprint).not.toBe(before.fingerprint);
    await git("add", "docs/base/tree.dts");
    expect(await fingerprint()).toEqual(dirty);
  });

  it.each(["--assume-unchanged", "--skip-worktree"])(
    "detects asset edits hidden by Git's %s flag",
    async (flag) => {
      const before = await fingerprint();
      await git("update-index", flag, "docs/base/tree.dts");
      await fs.writeFile(path.join(source, "tree.dts"), "TREE");
      expect((await fingerprint()).fingerprint).not.toBe(before.fingerprint);
    },
  );

  it("ignores timestamp-only changes and reverts to the same fingerprint with the same contents", async () => {
    const before = await fingerprint();
    await fs.utimes(path.join(source, "tree.dts"), 0, 0);
    expect(await fingerprint()).toEqual(before);
    await fs.writeFile(path.join(source, "tree.dts"), "temporary");
    await fs.writeFile(path.join(source, "tree.dts"), "tree");
    expect(await fingerprint()).toEqual(before);
  });

  it("detects additions, renames and deletions without changing the metadata policy", async () => {
    const before = await fingerprint();
    await fs.writeFile(path.join(source, "new.PNG"), "png");
    const added = await fingerprint();
    expect(added.fingerprint).not.toBe(before.fingerprint);
    expect(added.policy).toBe(before.policy);
    await fs.rename(
      path.join(source, "new.PNG"),
      path.join(source, "renamed.PNG"),
    );
    expect((await fingerprint()).fingerprint).not.toBe(added.fingerprint);
    await fs.rm(path.join(source, "renamed.PNG"));
    expect(await fingerprint()).toEqual(before);
    await fs.rm(path.join(source, "tree.dts"));
    expect((await fingerprint()).fingerprint).not.toBe(before.fingerprint);
  });

  it("ignores excluded files and directories even when their extension is known", async () => {
    const before = await fingerprint();
    await fs.writeFile(path.join(source, ".DS_Store"), "metadata");
    await fs.writeFile(path.join(source, "README.md"), "notes");
    await fs.mkdir(path.join(source, "fonts"));
    await fs.writeFile(path.join(source, "fonts/font.png"), "font");
    expect(await listAssets(source)).toEqual(["tree.dts"]);
    expect(await fingerprint()).toEqual(before);
  });

  it("follows symlink content rather than trusting the link's Git blob", async () => {
    const target = path.join(root, "external.dts");
    await fs.writeFile(target, "outside");
    await fs.symlink(target, path.join(source, "link.dts"));
    await git("add", "docs/base/link.dts");
    const before = await fingerprint();
    await fs.writeFile(target, "changed");
    expect((await fingerprint()).fingerprint).not.toBe(before.fingerprint);
  });

  it("excludes ignored symlinks before resolving their targets", async () => {
    await fs.symlink(
      path.join(root, "missing"),
      path.join(source, "ignored.dso"),
    );
    expect(await listAssets(source)).toEqual(["tree.dts"]);
  });

  it("supports a directory without Git and rejects symlink cycles", async () => {
    const before = await fingerprint();
    await fs.rm(path.join(root, ".git"), { recursive: true });
    expect(await fingerprint()).toEqual(before);
    await fs.symlink(source, path.join(source, "loop"));
    await expect(listAssets(source)).rejects.toThrow("cycle");
  });

  it("includes effective precompression settings", async () => {
    const files = await listAssets(source);
    expect((await assetFingerprint(source, files, false)).fingerprint).not.toBe(
      (await fingerprint()).fingerprint,
    );
  });
});
