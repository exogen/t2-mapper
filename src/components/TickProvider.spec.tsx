import { expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { useFrame } from "@react-three/fiber";
import { TickProvider } from "./TickProvider";
import { FramePriority } from "./framePriority";

vi.mock("@react-three/fiber", () => ({ useFrame: vi.fn() }));

it("runs the 32 ms ticks at FramePriority.Tick, after the input drain", () => {
  renderToString(<TickProvider>{null}</TickProvider>);
  expect(vi.mocked(useFrame)).toHaveBeenCalledWith(
    expect.any(Function),
    FramePriority.Tick,
  );
});
