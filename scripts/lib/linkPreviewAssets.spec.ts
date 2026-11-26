import { describe, expect, it } from "vitest";
import {
  linkPreviewMissionDisplayName,
  linkPreviewMissionImage,
} from "./linkPreviewAssets";

describe("link preview gallery assets", () => {
  it("resolves internal names case-insensitively and preserves unknown names", () => {
    expect(linkPreviewMissionDisplayName("beggarsrun")).toBe("Beggar's Run");
    expect(linkPreviewMissionDisplayName("  Unknown Map  ")).toBe(
      "Unknown Map",
    );
  });

  it("resolves display-name aliases and uses the first gallery screenshot", () => {
    expect(linkPreviewMissionImage("Beggar's Run")).toEqual(
      linkPreviewMissionImage("BeggarsRun"),
    );
    expect(linkPreviewMissionImage("riverdance")).toEqual({
      url: "https://exogen.github.io/t2-maps/images/RiverDance.1.webp",
      alt: "Riverdance map screenshot",
      type: "image/webp",
      width: 1280,
      height: 720,
    });
  });

  it("uses a variant's own screenshot without substituting its base map", () => {
    expect(linkPreviewMissionImage("BeggarsRunLT")?.url).toBe(
      "https://exogen.github.io/t2-maps/images/BeggarsRunLT.1.webp",
    );
    expect(linkPreviewMissionImage("BeggarsRunLT")?.url).not.toBe(
      linkPreviewMissionImage("BeggarsRun")?.url,
    );
  });

  it("uses the app fallback when the mission has no gallery screenshot", () => {
    // The app manifest knows this map; that alone doesn't prove gallery art exists.
    expect(linkPreviewMissionDisplayName("Cluster_BeggarsRunLT")).not.toBe("");
    expect(linkPreviewMissionImage("Cluster_BeggarsRunLT")).toBeUndefined();
    expect(
      linkPreviewMissionImage("DefinitelyNotInTheManifest"),
    ).toBeUndefined();
    expect(linkPreviewMissionImage("")).toBeUndefined();
  });

  it("preserves a configured gallery path prefix without adding game asset paths", () => {
    expect(
      linkPreviewMissionImage("BeggarsRun", "http://localhost:3000/gallery")
        ?.url,
    ).toBe("http://localhost:3000/gallery/BeggarsRun.1.webp");
    expect(() =>
      linkPreviewMissionImage("RiverDance", "file:///tmp/gallery"),
    ).toThrow("Gallery base URL must use HTTP or HTTPS");
  });
});
