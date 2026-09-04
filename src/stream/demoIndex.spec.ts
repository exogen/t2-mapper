import { describe, expect, it } from "vitest";
import {
  CAST_BASE_URL,
  commentaryFileName,
  commentarySidecarUrl,
  sidecarUrl,
} from "./demoIndex";

describe("sidecarUrl", () => {
  it("names the sidecar after the demo, under the cast base", () => {
    // The demo streams from the bucket; its sidecars may come from
    // elsewhere (a local folder in dev) but keep the bucket's names.
    const source = "https://demos.example/demos/the%20cut_abc.rec";
    expect(sidecarUrl(source, "cast.json")).toBe(
      `${CAST_BASE_URL}/the%20cut_abc.rec.cast.json`,
    );
  });
});

describe("commentary track files", () => {
  const source = "https://demos.example/demos/the%20cut_abc.rec";

  it("keeps the unlabelled pair for the default track, and for no track at all", () => {
    expect(commentaryFileName(null, "mp3")).toBe("commentary.mp3");
    expect(commentaryFileName({ suffix: undefined }, "json")).toBe(
      "commentary.json",
    );
    expect(commentarySidecarUrl(source, null, "mp3")).toBe(
      `${CAST_BASE_URL}/the%20cut_abc.rec.commentary.mp3`,
    );
  });

  it("puts a labelled track's suffix between the demo and the kind", () => {
    expect(commentaryFileName({ suffix: "Gemini" }, "json")).toBe(
      "Gemini.commentary.json",
    );
    expect(commentarySidecarUrl(source, { suffix: "Gemini" }, "mp3")).toBe(
      `${CAST_BASE_URL}/the%20cut_abc.rec.Gemini.commentary.mp3`,
    );
  });
});
