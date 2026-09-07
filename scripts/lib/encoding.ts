/**
 * Plain-text game files ship in a mix of Windows-1252 (the game's own era)
 * and UTF-8 (later community re-saves). Everything under docs/base is
 * normalized to UTF-8 as it is added, so the app decodes one encoding and
 * never has to guess.
 */
import path from "node:path";

/**
 * File types that hold text. A whitelist on purpose: .ifr and .sfk read
 * like text extensions but are binary, and re-encoding one would corrupt
 * it beyond repair.
 */
export const TEXT_EXTENSIONS = new Set([
  ".cs",
  ".dml",
  ".hfl",
  ".ifl",
  ".log",
  ".map",
  ".md",
  ".mis",
  ".rb",
]);

export function isTextAsset(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export type SourceEncoding = "ascii" | "utf-8" | "windows-1252";

export interface Utf8Conversion {
  bytes: Buffer;
  from: SourceEncoding;
  /** Why the bytes were left alone; set only when converting isn't safe. */
  problem?: string;
  /** An oddity worth a look that doesn't block the conversion. */
  warning?: string;
}

const utf8Strict = new TextDecoder("utf-8", { fatal: true });
const utf8 = new TextDecoder("utf-8");

/**
 * Bytes 0x80-0x9F, the only range where Windows-1252 differs from Latin-1
 * (the five unassigned slots keep their C1 code points, per the WHATWG
 * encoding index). Spelled out because Node's own
 * TextDecoder("windows-1252") decodes this range as Latin-1, which would
 * turn the game's curly quotes into control characters — browsers get it
 * right, so this table is also what the app itself used to see.
 */
const WINDOWS_1252_HIGH = "€‚ƒ„…†‡" + "ˆ‰Š‹ŒŽ" + "‘’“”•–—" + "˜™š›œžŸ";

const WINDOWS_1252 = Array.from({ length: 256 }, (_, byte) =>
  byte >= 0x80 && byte <= 0x9f
    ? WINDOWS_1252_HIGH[byte - 0x80]
    : String.fromCharCode(byte),
);

/** Code point → byte. One-to-one, which is what makes a conversion lossless. */
const WINDOWS_1252_BYTES = new Map(
  WINDOWS_1252.map((char, byte): [string, number] => [char, byte]),
);

if (WINDOWS_1252_BYTES.size !== 256) {
  throw new Error("Windows-1252 table is not one-to-one");
}

/** Text that was already decoded once as Latin-1 by some upstream tool. */
const MOJIBAKE = /\u00e2\u20ac|\u00c3[\u0080-\u00bf]|\u00c2[\u00a0-\u00bf]/;

function fromWindows1252(bytes: Buffer): string {
  return Array.from(bytes, (byte) => WINDOWS_1252[byte]).join("");
}

function toWindows1252(text: string): Buffer | null {
  const bytes = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    const byte = WINDOWS_1252_BYTES.get(text[i]);
    if (byte === undefined) return null;
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * The bytes as UTF-8. ASCII and well-formed UTF-8 come back untouched;
 * anything else is read as Windows-1252 and re-encoded. That mapping is
 * lossless — each of the 256 bytes has its own code point — and every
 * conversion is checked by encoding back and comparing to the input.
 */
export function toUtf8(bytes: Buffer): Utf8Conversion {
  if (bytes.every((byte) => byte < 0x80)) {
    return { bytes, from: "ascii" };
  }

  try {
    const text = utf8Strict.decode(bytes);
    if (text.includes("�")) {
      return {
        bytes,
        from: "utf-8",
        problem: "contains U+FFFD: a character was lost before we got the file",
      };
    }
    return MOJIBAKE.test(text)
      ? { bytes, from: "utf-8", warning: "reads as mojibake" }
      : { bytes, from: "utf-8" };
  } catch {
    // Not UTF-8, so Windows-1252 — what the game and its tooling wrote.
  }

  if (bytes.includes(0)) {
    return {
      bytes,
      from: "windows-1252",
      problem: "NUL bytes alongside non-ASCII: this looks binary, not text",
    };
  }

  const converted = Buffer.from(fromWindows1252(bytes), "utf8");
  if (!toWindows1252(utf8.decode(converted))?.equals(bytes)) {
    return {
      bytes,
      from: "windows-1252",
      problem: "conversion did not round-trip back to the original bytes",
    };
  }
  return { bytes: converted, from: "windows-1252" };
}
