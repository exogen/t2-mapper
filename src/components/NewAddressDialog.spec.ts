import { describe, it, expect } from "vitest";
import { buildNewUrl } from "./NewAddressDialog";

describe("buildNewUrl", () => {
  it("preserves query params and hash", () => {
    const url = buildNewUrl(
      "?mission=Katabatic~CTF&mode=command#c672,2500,-144~-0.707,0,0,0.707~1.5",
    );
    expect(url).toBe(
      "https://play.tribes2.online/?mission=Katabatic~CTF&mode=command#c672,2500,-144~-0.707,0,0,0.707~1.5",
    );
  });

  it("returns the bare origin when there is no query or hash", () => {
    expect(buildNewUrl("")).toBe("https://play.tribes2.online/");
  });
});
