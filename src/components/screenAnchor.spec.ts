import { describe, it, expect } from "vitest";
import { anchorPlacement, type ScreenRect } from "./screenAnchor";

const RECT: ScreenRect = { minX: 100, minY: 50, maxX: 300, maxY: 250 };

describe("anchorPlacement", () => {
  it("places corner anchors on the rect corners", () => {
    expect(anchorPlacement(RECT, "top-left")).toEqual({
      x: 100,
      y: 50,
      translate: "translate(-100%, -100%)",
    });
    expect(anchorPlacement(RECT, "bottom-right")).toEqual({
      x: 300,
      y: 250,
      translate: "translate(0, 0)",
    });
  });

  it("places edge anchors on edge midpoints", () => {
    expect(anchorPlacement(RECT, "top")).toEqual({
      x: 200,
      y: 50,
      translate: "translate(-50%, -100%)",
    });
    expect(anchorPlacement(RECT, "right")).toEqual({
      x: 300,
      y: 150,
      translate: "translate(0, -50%)",
    });
    expect(anchorPlacement(RECT, "bottom")).toEqual({
      x: 200,
      y: 250,
      translate: "translate(-50%, 0)",
    });
    expect(anchorPlacement(RECT, "left")).toEqual({
      x: 100,
      y: 150,
      translate: "translate(-100%, -50%)",
    });
  });

  it("centers the label for the center anchor", () => {
    expect(anchorPlacement(RECT, "center")).toEqual({
      x: 200,
      y: 150,
      translate: "translate(-50%, -50%)",
    });
  });

  it("applies pixel offsets in screen axes", () => {
    expect(anchorPlacement(RECT, "bottom-right", [4, 6])).toMatchObject({
      x: 304,
      y: 256,
    });
    expect(anchorPlacement(RECT, "top-left", [-4, -6])).toMatchObject({
      x: 96,
      y: 44,
    });
  });
});
