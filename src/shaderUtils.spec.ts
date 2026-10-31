import { describe, expect, it, vi } from "vitest";
import {
  insertAfterChunk,
  insertBeforeChunk,
  replaceChunk,
} from "./shaderUtils";

const warn = vi.hoisted(() => vi.fn());
vi.mock("./logger", () => ({ createLogger: () => ({ warn }) }));

const source = "a\n#include <common>\nb\n#include <common>\n";

describe("chunk patching", () => {
  it("patches only the first include", () => {
    expect(insertAfterChunk(source, "common", "x")).toBe(
      "a\n#include <common>\nx\nb\n#include <common>\n",
    );
    expect(insertBeforeChunk(source, "common", "x")).toBe(
      "a\nx\n#include <common>\nb\n#include <common>\n",
    );
    expect(replaceChunk(source, "common", "x")).toBe(
      "a\nx\nb\n#include <common>\n",
    );
  });

  it("inserts code literally, without replace() patterns", () => {
    expect(replaceChunk(source, "common", "$&$$")).toBe(
      "a\n$&$$\nb\n#include <common>\n",
    );
  });

  it("leaves the source alone and warns once per missing chunk", () => {
    expect(insertAfterChunk(source, "missing_chunk", "x")).toBe(source);
    expect(insertBeforeChunk(source, "missing_chunk", "x")).toBe(source);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toContain("#include <missing_chunk>");
  });
});
