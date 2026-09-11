import { describe, expect, it } from "vitest";
import { parseChangedUrls } from "./assetSyncReport.js";

const parse = (report: string) =>
  parseChangedUrls(report, "s3://t2-assets/", "https://assets.tribes2.online/");

describe("asset purge URLs", () => {
  it("deduplicates uploads and deletions retained from previous attempts", () => {
    expect(
      parse(
        [
          "upload: docs/base/a.cs to s3://t2-assets/game/base/a.cs",
          "delete: s3://t2-assets/game/base/a.cs",
          "upload: ./docs/base/a.cs to s3://t2-assets/game/base/a.cs",
        ].join("\n"),
      ),
    ).toEqual(["https://assets.tribes2.online/game/base/a.cs"]);
  });

  it("escapes literal punctuation, spaces and Unicode without changing object keys", () => {
    expect(
      parse("upload: local to s3://t2-assets/game/base/café #1? 50%25.dts"),
    ).toEqual([
      "https://assets.tribes2.online/game/base/caf%C3%A9%20%231%3F%2050%2525.dts",
    ]);
    expect(parse("delete: s3://t2-assets/game/base/file.cs ")).toEqual([
      "https://assets.tribes2.online/game/base/file.cs%20",
    ]);
  });

  it("ignores state markers, dry runs and other buckets", () => {
    expect(
      parse(
        [
          '# asset-sync-state: "hash"',
          "(dryrun) upload: local to s3://t2-assets/game/base/a.cs",
          "delete: s3://another-bucket/game/base/a.cs",
          "delete: s3://t2-assets-other/game/base/a.cs",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("handles Windows report line endings", () => {
    expect(parse("delete: s3://t2-assets/game/base/a.cs\r\n")).toEqual([
      "https://assets.tribes2.online/game/base/a.cs",
    ]);
  });
});
