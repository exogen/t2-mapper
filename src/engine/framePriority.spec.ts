import { describe, expect, it } from "vitest";
import { FramePriority } from "./framePriority";

describe("FramePriority", () => {
  it("samples, drains and ticks input before posing the live camera", () => {
    const pipeline = [
      FramePriority.InputTouch,
      FramePriority.InputKeyboardMouse,
      FramePriority.CameraInput,
      FramePriority.Tick,
      FramePriority.CameraLive,
    ];
    for (let i = 1; i < pipeline.length; i++) {
      expect(pipeline[i]).toBeGreaterThan(pipeline[i - 1]);
    }
    expect(FramePriority.CameraTour).toBeLessThan(FramePriority.InputTouch);
    expect(FramePriority.CameraLive).toBeLessThan(
      FramePriority.CameraCommandCircuit,
    );
  });
});
