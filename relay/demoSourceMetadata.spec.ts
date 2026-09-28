import { describe, expect, it } from "vitest";
import {
  contentDispositionFilename,
  sourceDemoMetadata,
} from "./demoSourceMetadata";

describe("source download filenames", () => {
  it.each([
    [null, null],
    ["inline", null],
    [
      "attachment; filename=auto-capture_2026-09-08_05-21_DemoBot-Mia_CTFGame_DiscordLT.rec",
      "auto-capture_2026-09-08_05-21_DemoBot-Mia_CTFGame_DiscordLT.rec",
    ],
    ['attachment; filename="my demo; final.rec"', "my demo; final.rec"],
    ['attachment; filename="my \\"demo\\".rec"', 'my "demo".rec'],
    [
      "attachment; filename=plain.rec; filename*=UTF-8''caf%C3%A9.rec",
      "café.rec",
    ],
    [
      "attachment; filename*=UTF-8'en'caf%C3%A9.rec; filename=plain.rec",
      "café.rec",
    ],
    [
      "attachment; filename=plain.rec; filename*=UTF-8''bad%ZZ.rec",
      "plain.rec",
    ],
    ["attachment; filename*=ISO-8859-1''caf%E9.rec", "café.rec"],
    ["attachment; filename=../../demo.rec", "../../demo.rec"],
  ])("reads %j", (header, filename) => {
    expect(contentDispositionFilename(header)).toBe(filename);
  });
});

describe("source metadata validation", () => {
  const metadata = {
    format: "t2-source-demo",
    schemaVersion: 1,
    source: "tribesforever",
    id: "22945",
    sourceUrl: "https://tribesforever.com/demo/22945/download",
    fetchedAt: "2026-09-28T12:00:00.000Z",
    recordedAt: null,
    originalFilename: null,
    gameVersion: 25034,
    protocolVersion: 0x330004,
    durationMs: 1259725,
  };
  it("accepts absent optional headers", () => {
    expect(sourceDemoMetadata(metadata)).toEqual(metadata);
  });
  it.each([
    { schemaVersion: 2 },
    { gameVersion: 25033 },
    { protocolVersion: 25034 },
    { durationMs: -1 },
    { durationMs: 1.5 },
    { durationMs: Infinity },
    { fetchedAt: "invalid" },
    { recordedAt: "invalid" },
    { originalFilename: "" },
  ])("rejects invalid metadata %j", (changes) => {
    expect(sourceDemoMetadata({ ...metadata, ...changes })).toBeNull();
  });
});
