import { useMediaQuery } from "./useMediaQuery";

// Only check pointer: coarse. Adding "hover: none" would be more precise but
// Samsung Android devices incorrectly report hover: hover for touchscreens.
// See: https://www.ctrl.blog/entry/css-media-hover-samsung.html
export function useTouchDevice() {
  return useMediaQuery("(pointer: coarse)");
}
