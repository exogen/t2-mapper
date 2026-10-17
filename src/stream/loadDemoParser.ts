import { DemoParser } from "t2-demo-parser";

/** Keep asynchronous decompression, recovering complete blocks from unfinished demos. */
export async function loadDemoParser(
  data: Uint8Array,
  { allowPartial = true }: { allowPartial?: boolean } = {},
): Promise<DemoParser> {
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
  return parser;
}
