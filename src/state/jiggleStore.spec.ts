import { afterEach, describe, expect, it } from "vitest";
import {
  chestSizeFromPercent,
  chestSizeToPercent,
  useJiggle,
} from "./jiggleStore";

afterEach(() => useJiggle.setState(useJiggle.getInitialState()));

describe("chest controls", () => {
  it("remaps the endpoints without increasing the maximum physical size", () => {
    expect(chestSizeFromPercent(0)).toBe(0.7);
    expect(chestSizeFromPercent(100)).toBe(1);
    expect(chestSizeFromPercent(500)).toBe(3);
    expect(chestSizeFromPercent(-100)).toBe(0.7);
    expect(chestSizeFromPercent(600)).toBe(3);
    for (let percent = 0; percent <= 500; percent++) {
      const size = chestSizeFromPercent(percent);
      expect(chestSizeToPercent(size)).toBe(percent);
      expect(size).toBeGreaterThanOrEqual(0.7);
      expect(size).toBeLessThanOrEqual(3);
    }
    expect(useJiggle.getState().sizes.male).toBe(1);
    expect(chestSizeToPercent(useJiggle.getState().sizes.male)).toBe(100);
  });

  it("enforces physical limits and ignores invalid size changes", () => {
    const { setSize } = useJiggle.getState();
    setSize("male", 0);
    setSize("female", 4);
    setSize("bioderm", NaN);
    setSize("bioderm", Infinity);
    expect(useJiggle.getState().sizes).toEqual({
      male: 0.7,
      female: 3,
      bioderm: 1,
    });
  });

  it("changes firmness in 10% steps without changing size", () => {
    const { setFirmness, sizes } = useJiggle.getState();
    for (let firmness = 0; firmness <= 100; firmness += 10) {
      setFirmness(firmness);
      expect(useJiggle.getState().firmness).toBe(firmness);
      expect(useJiggle.getState().sizes).toEqual(sizes);
    }
    setFirmness(54);
    expect(useJiggle.getState().firmness).toBe(50);
    setFirmness(-10);
    expect(useJiggle.getState().firmness).toBe(0);
    setFirmness(110);
    expect(useJiggle.getState().firmness).toBe(100);
    setFirmness(NaN);
    expect(useJiggle.getState().firmness).toBe(100);
  });
});
