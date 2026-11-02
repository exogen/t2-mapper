import { expect, it } from "vitest";
import { replayInviteUrl } from "./replayLinks";

it("shares only the replay session while retaining the application's base path", () => {
  expect(
    replayInviteUrl(
      "https://example.com/t2-mapper/?mode=demo&demo=a.rec&t=8&ownerToken=private#camera",
      "room",
    ),
  ).toBe("https://example.com/t2-mapper/?replay=room");
});
