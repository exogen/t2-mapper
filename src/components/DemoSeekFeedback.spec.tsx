import { beforeEach, expect, it, vi } from "vitest";
import type { StreamRecording } from "../stream/types";

const fixture = vi.hoisted(() => ({
  recording: { source: "demo", duration: 100 } as StreamRecording,
  actions: new Map<string, () => void>(),
  seekBy: vi.fn(),
  setFlash: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [null, fixture.setFlash],
}));
vi.mock("../state/engineStore", () => ({
  isCurrentPlayback: () => true,
}));
vi.mock("./InputControls", () => ({
  useInputAction: (name: string, action: () => void) =>
    fixture.actions.set(name, action),
}));
vi.mock("./usePlayback", () => ({
  useRecording: () => fixture.recording,
  usePlaybackActions: () => ({ seekBy: fixture.seekBy }),
}));

import { DemoSeekFeedback } from "./DemoSeekFeedback";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.actions.clear();
});

it.each([false, true])(
  "shows shortcut feedback only when its seek is accepted (%s)",
  (accepted) => {
    fixture.seekBy.mockReturnValue(accepted);
    DemoSeekFeedback();
    fixture.actions.get("seekForward")!();
    expect(fixture.seekBy).toHaveBeenCalledExactlyOnceWith(5);
    expect(fixture.setFlash).toHaveBeenCalledTimes(accepted ? 1 : 0);
  },
);
