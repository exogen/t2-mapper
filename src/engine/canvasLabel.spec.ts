import { afterEach, expect, it, vi } from "vitest";
import {
  getSvgIconLabel,
  getTintedIconLabel,
  subscribeLabelIconReady,
} from "./canvasLabel";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["SVG", () => getSvgIconLabel("<svg/>", 12, 12)],
  [
    "tinted",
    () => getTintedIconLabel("/triangle.png", "red", { size: 12, margin: 2 }),
  ],
] as const)(
  "wakes only active overlays when a %s icon loads",
  (_, readIcon) => {
    let finishLoad: (() => void) | undefined;
    class TestImage {
      onload: (() => void) | null = null;

      set src(_url: string) {
        finishLoad = () => this.onload?.();
      }
    }
    vi.stubGlobal("Image", TestImage);
    const redraw = vi.fn();
    const staleRedraw = vi.fn();
    const unsubscribe = subscribeLabelIconReady(redraw);
    const unsubscribeStale = subscribeLabelIconReady(staleRedraw);
    try {
      expect(readIcon()).toBeNull();
      expect(redraw).not.toHaveBeenCalled();
      unsubscribeStale();
      finishLoad?.();
      expect(redraw).toHaveBeenCalledOnce();
      expect(staleRedraw).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      unsubscribeStale();
    }
  },
);
