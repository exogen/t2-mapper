import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function jsonText(value: unknown): string {
  const json = JSON.stringify(
    value,
    (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    2,
  );
  return json === undefined ? "" : `${json}\n`;
}

/** Compare JSON values, ignoring whitespace and object-key insertion order. */
export async function formatJsonDiff(
  label: string,
  before: unknown,
  after: unknown,
): Promise<string | null> {
  const oldText = jsonText(before);
  const newText = jsonText(after);
  if (oldText === newText) return null;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "t2-json-diff-"));
  try {
    await Promise.all([
      fs.writeFile(path.join(directory, "old.json"), oldText),
      fs.writeFile(path.join(directory, "new.json"), newText),
    ]);
    let output: string;
    try {
      ({ stdout: output } = await execFileAsync(
        "git",
        [
          "diff",
          "--no-index",
          "--no-ext-diff",
          "--no-textconv",
          "--color=never",
          "--text",
          "--",
          "old.json",
          "new.json",
        ],
        { cwd: directory, encoding: "utf8" },
      ));
    } catch (error) {
      // git uses exit status 1 for a successful diff with changes.
      const result = error as { code?: unknown; stdout?: unknown };
      if (result.code !== 1 || typeof result.stdout !== "string") throw error;
      output = result.stdout;
    }
    const hunks = output
      .trimEnd()
      .split("\n")
      .filter((line) => !/^(diff --git |index |--- |\+\+\+ )/.test(line));
    return [`--- old/${label}`, `+++ new/${label}`, ...hunks].join("\n");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
