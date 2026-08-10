/**
 * Pure math for positioning DOM labels against an object's projected
 * screen-space bounding rectangle.
 */

export interface ScreenRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type ScreenAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left"
  | "center";

export interface AnchorPlacement {
  /**
   * The rect point the label attaches to, in screen pixels.
   */
  x: number;
  y: number;
  /**
   * CSS translate percentages that shift the label's own box so it sits
   * outside the rect adjacent to the anchor (or centered, for "center").
   */
  translate: string;
}

const ORIGINS: Record<ScreenAnchor, string> = {
  "top-left": "translate(-100%, -100%)",
  top: "translate(-50%, -100%)",
  "top-right": "translate(0, -100%)",
  right: "translate(0, -50%)",
  "bottom-right": "translate(0, 0)",
  bottom: "translate(-50%, 0)",
  "bottom-left": "translate(-100%, 0)",
  left: "translate(-100%, -50%)",
  center: "translate(-50%, -50%)",
};

/**
 * Picks the anchor point on the rect and the label-origin translation for
 * the given anchor. `offset` is added in screen pixels (+x right, +y down).
 */
export function anchorPlacement(
  rect: ScreenRect,
  anchor: ScreenAnchor,
  offset: readonly [number, number] = [0, 0],
): AnchorPlacement {
  const centerX = (rect.minX + rect.maxX) / 2;
  const centerY = (rect.minY + rect.maxY) / 2;
  let x: number;
  let y: number;
  switch (anchor) {
    case "top-left":
      x = rect.minX;
      y = rect.minY;
      break;
    case "top":
      x = centerX;
      y = rect.minY;
      break;
    case "top-right":
      x = rect.maxX;
      y = rect.minY;
      break;
    case "right":
      x = rect.maxX;
      y = centerY;
      break;
    case "bottom-right":
      x = rect.maxX;
      y = rect.maxY;
      break;
    case "bottom":
      x = centerX;
      y = rect.maxY;
      break;
    case "bottom-left":
      x = rect.minX;
      y = rect.maxY;
      break;
    case "left":
      x = rect.minX;
      y = centerY;
      break;
    case "center":
      x = centerX;
      y = centerY;
      break;
  }
  return { x: x + offset[0], y: y + offset[1], translate: ORIGINS[anchor] };
}
