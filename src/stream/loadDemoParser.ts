import { DemoParser } from "t2-demo-parser";

/** The parser each recording's bytes were first loaded into. */
const loadedParsers = new WeakMap<ArrayBufferLike, DemoParser>();

const isWholeBuffer = (data: Uint8Array) =>
  data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;

/**
 * Let later loads of `data` fork `parser` instead of inflating the
 * recording again. `parser` must hold every block of `data`: loaded, and
 * finished if incremental.
 */
export function shareDemoParser(
  data: ArrayBufferLike,
  parser: DemoParser,
): void {
  if (!loadedParsers.has(data)) loadedParsers.set(data, parser);
}

/**
 * A parser over a whole recording, at its first block. Each recording is
 * inflated once: loading the same buffer again forks the parser that first
 * read it. Keeps asynchronous decompression, recovering complete blocks
 * from unfinished demos unless `allowPartial` is false.
 */
export async function loadDemoParser(
  data: Uint8Array,
  { allowPartial = true }: { allowPartial?: boolean } = {},
): Promise<DemoParser> {
  // A strict load has to inflate to find out whether the stream is whole.
  const shared =
    allowPartial && isWholeBuffer(data)
      ? loadedParsers.get(data.buffer)
      : undefined;
  if (shared) return shared.fork();
  let parser = new DemoParser(data);
  try {
    await parser.load();
  } catch (error) {
    // fflate's UnexpectedEOF (code 0): a recording/download can end before
    // the deflate stream is finalized. Other corruption still fails the load.
    if (
      !allowPartial ||
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== 0
    )
      throw error;
    parser = new DemoParser(data, { incremental: true });
    await parser.load();
    parser.finish();
  }
  if (isWholeBuffer(data)) shareDemoParser(data.buffer, parser);
  return parser;
}
