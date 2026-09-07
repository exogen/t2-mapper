import { describe, expect, it } from "vitest";
import { isTextAsset, toUtf8 } from "./encoding";

/** WHATWG windows-1252 index for bytes 0x80-0x9F. */
const INDEX = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const decode = (bytes: Buffer) => new TextDecoder("utf-8").decode(bytes);

describe("isTextAsset", () => {
  it("accepts the game's text types, case-insensitively", () => {
    expect(isTextAsset("missions/Foo.MIS")).toBe(true);
    expect(isTextAsset("textures/bar.dml")).toBe(true);
    expect(isTextAsset("scripts/baz.cs")).toBe(true);
  });

  it("rejects binary types that look textual", () => {
    // .ifr is a binary effects file, one letter from the text .ifl.
    expect(isTextAsset("effects/packs.ifr")).toBe(false);
    expect(isTextAsset("audio/fx/x.sfk")).toBe(false);
    expect(isTextAsset("terrains/x.ter")).toBe(false);
    expect(isTextAsset("shapes/x.dts")).toBe(false);
  });
});

describe("toUtf8", () => {
  it("leaves ASCII untouched", () => {
    const bytes = Buffer.from("new SimGroup(MissionGroup) {\r\n};\r\n");
    const result = toUtf8(bytes);
    expect(result.from).toBe("ascii");
    expect(result.bytes).toBe(bytes);
  });

  it("leaves well-formed UTF-8 untouched", () => {
    const bytes = Buffer.from("//If you’re not moving, you’re dying.", "utf8");
    const result = toUtf8(bytes);
    expect(result.from).toBe("utf-8");
    expect(result.bytes).toBe(bytes);
  });

  it("maps every Windows-1252 byte to its own code point", () => {
    // 0x00-0x7F is ASCII, so start at 0x80 to force the 1252 branch.
    for (let byte = 0x80; byte <= 0xff; byte++) {
      const result = toUtf8(Buffer.from([0x2f, 0x2f, byte]));
      expect(result.problem, `byte 0x${byte.toString(16)}`).toBeUndefined();
      expect(result.from).toBe("windows-1252");
      const expected =
        byte <= 0x9f
          ? String.fromCodePoint(INDEX[byte - 0x80])
          : String.fromCodePoint(byte);
      expect(decode(result.bytes), `byte 0x${byte.toString(16)}`).toBe(
        `//${expected}`,
      );
    }
  });

  it("reads 0x92 as a curly apostrophe, not a control character", () => {
    // The trap: Node's own TextDecoder("windows-1252") yields U+0092 here.
    const result = toUtf8(Buffer.from([0x57, 0x65, 0x92, 0x6c, 0x6c]));
    expect(decode(result.bytes)).toBe("We’ll");
    expect(result.bytes).toEqual(Buffer.from("We’ll", "utf8"));
  });

  it("preserves CRLF line endings", () => {
    const result = toUtf8(Buffer.from([0x61, 0x0d, 0x0a, 0xfc, 0x0d, 0x0a]));
    expect(decode(result.bytes)).toBe("a\r\nü\r\n");
  });

  it("refuses a file that already lost a character to U+FFFD", () => {
    const bytes = Buffer.from("//Don�t bleed out...", "utf8");
    const result = toUtf8(bytes);
    expect(result.problem).toMatch(/U\+FFFD/);
    expect(result.bytes).toBe(bytes);
  });

  it("refuses non-ASCII bytes mixed with NULs, which mean binary", () => {
    const bytes = Buffer.from([0x61, 0x00, 0xfc]);
    const result = toUtf8(bytes);
    expect(result.problem).toMatch(/binary/);
    expect(result.bytes).toBe(bytes);
  });

  it("flags text that reads as mojibake without changing it", () => {
    const bytes = Buffer.from("//DonÃ©", "utf8");
    const result = toUtf8(bytes);
    expect(result.warning).toMatch(/mojibake/);
    expect(result.bytes).toBe(bytes);
  });
});
