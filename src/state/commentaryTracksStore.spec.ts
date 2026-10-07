import { afterEach, expect, it, vi } from "vitest";
import { commentaryTracksStore } from "./commentaryTracksStore";
import { CAST_CONTRACT_VERSION } from "../director/castContract";

afterEach(async () => {
  await commentaryTracksStore.getState().load(null);
  vi.unstubAllGlobals();
});

it.each([
  [
    {
      format: "castgenius-plan",
      plan: { contractVersion: CAST_CONTRACT_VERSION, shots: [{}] },
    },
    false,
  ],
  [{ format: "castgenius-plan", plan: { shots: [{}] }, version: 1 }, true],
  [{ format: "castgenius-plan", commentary: [{ label: "Default" }] }, true],
  [{ format: "castgenius-plan", commentary: [] }, false],
] as const)(
  "identifies commentary availability from %j",
  async (doc, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => doc }),
    );
    await commentaryTracksStore
      .getState()
      .load("https://example.test/demo.rec");
    expect(commentaryTracksStore.getState().hasCommentary).toBe(expected);
  },
);
