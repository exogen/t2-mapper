import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS worker module, no types package installed
import { acceptsBrotli } from "./index.js";

describe("acceptsBrotli", () => {
  it("accepts the ordinary browser headers", () => {
    expect(acceptsBrotli("gzip, deflate, br")).toBe(true);
    expect(acceptsBrotli("gzip, deflate, br, zstd")).toBe(true);
    expect(acceptsBrotli("br")).toBe(true);
    expect(acceptsBrotli(" BR ")).toBe(true);
  });

  it("refuses when brotli is absent", () => {
    expect(acceptsBrotli("gzip, deflate")).toBe(false);
    expect(acceptsBrotli("identity")).toBe(false);
    expect(acceptsBrotli("")).toBe(false);
    expect(acceptsBrotli(null)).toBe(false);
  });

  it("honours an explicit refusal, which a substring test would miss", () => {
    expect(acceptsBrotli("gzip, br;q=0")).toBe(false);
    expect(acceptsBrotli("br;q=0.0")).toBe(false);
    expect(acceptsBrotli("br; q=0")).toBe(false);
    expect(acceptsBrotli("br;q=0.001")).toBe(true);
  });

  it("treats a wildcard as acceptance unless brotli is named", () => {
    expect(acceptsBrotli("*")).toBe(true);
    expect(acceptsBrotli("gzip, *")).toBe(true);
    expect(acceptsBrotli("*;q=0")).toBe(false);
    // An explicit br entry beats the wildcard either way.
    expect(acceptsBrotli("*, br;q=0")).toBe(false);
    expect(acceptsBrotli("*;q=0, br")).toBe(true);
  });

  it("is not fooled by tokens that merely contain br", () => {
    expect(acceptsBrotli("brotli-x")).toBe(false);
    expect(acceptsBrotli("gzip, xbr")).toBe(false);
  });
});
