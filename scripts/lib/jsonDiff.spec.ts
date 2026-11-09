import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatJsonDiff } from "./jsonDiff.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("JSON value diffs", () => {
  it("shows nested additions, removals, and array changes with stable file labels", async () => {
    const diff = await formatJsonDiff(
      "demos/final.rec.json",
      {
        games: [{ title: "Old final", teamNames: { 1: "Storm" } }],
        obsolete: true,
        players: ["Alice", "Bob"],
      },
      {
        games: [{ title: "New final", teamNames: { 1: "Knights" } }],
        added: "new field",
        players: ["Alice", "Carol"],
      },
    );
    expect(diff).toContain(
      "--- old/demos/final.rec.json\n+++ new/demos/final.rec.json\n@@",
    );
    expect(diff).toContain('+  "added": "new field",');
    expect(diff).toContain('-  "obsolete": true,');
    expect(diff).toContain('-        "1": "Storm"');
    expect(diff).toContain('+        "1": "Knights"');
    expect(diff).toContain('-      "title": "Old final"');
    expect(diff).toContain('+      "title": "New final"');
    expect(diff).toContain('-    "Bob"');
    expect(diff).toContain('+    "Carol"');
    expect(diff).not.toContain("diff --git");
    expect(diff).not.toContain("t2-json-diff-");
  });

  it("ignores object key order and fields omitted by JSON without creating temporary files", async () => {
    const temporary = vi.spyOn(fs, "mkdtemp");
    await expect(
      formatJsonDiff(
        "same.rec.json",
        { title: "Final", details: { z: 1, a: 2 }, missing: undefined },
        { details: { a: 2, z: 1 }, title: "Final" },
      ),
    ).resolves.toBeNull();
    expect(temporary).not.toHaveBeenCalled();
  });

  it("preserves array order when comparing values", async () => {
    const diff = await formatJsonDiff(
      "teams.json",
      ["Storm", "Inferno"],
      ["Inferno", "Storm"],
    );
    expect(diff).not.toBeNull();
    expect(diff).toContain('-  "Storm",');
    expect(diff).toContain('+  "Storm"');
  });

  it("shows a missing sidecar as additions", async () => {
    const diff = await formatJsonDiff("new.rec.json", undefined, {
      title: "Final",
    });
    expect(diff).toBe(
      '--- old/new.rec.json\n+++ new/new.rec.json\n@@ -0,0 +1,3 @@\n+{\n+  "title": "Final"\n+}',
    );
  });

  it("does not invoke a configured external diff and cleans up its temporary files", async () => {
    vi.stubEnv("GIT_EXTERNAL_DIFF", "/nonexistent/json-diff-command");
    const temporary = vi.spyOn(fs, "mkdtemp");
    await expect(formatJsonDiff("value.json", 1, 2)).resolves.toContain(
      "-1\n+2",
    );
    const directory = await temporary.mock.results[0].value;
    await expect(fs.stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("propagates git failures and still removes its temporary files", async () => {
    vi.stubEnv("PATH", "/nonexistent/json-diff-bin");
    const temporary = vi.spyOn(fs, "mkdtemp");
    await expect(formatJsonDiff("value.json", 1, 2)).rejects.toMatchObject({
      code: "ENOENT",
    });
    const directory = await temporary.mock.results[0].value;
    await expect(fs.stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
