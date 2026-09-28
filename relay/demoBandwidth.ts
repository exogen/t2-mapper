import { Readable, Transform } from "node:stream";
import {
  DemoTooLargeError,
  DemoValidationError,
  MAX_SOURCE_DEMO_BYTES,
} from "./demoSourceValidation.js";

export const DEMO_BYTES_PER_SECOND = 4 * 1024 * 1024;

/** Pace source chunks and let stream backpressure slow the download. */
export function throttleDemoDownload(
  source: Readable,
  signal: AbortSignal,
  expectedBytes: number,
): Transform {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let received = 0;
  const throttled = new Transform({
    signal,
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_SOURCE_DEMO_BYTES)
        return callback(new DemoTooLargeError());
      if (received > expectedBytes)
        return callback(
          new DemoValidationError("Demo size does not match Content-Length"),
        );
      timer = setTimeout(
        () => {
          timer = undefined;
          callback(null, chunk);
        },
        Math.ceil((chunk.length * 1000) / DEMO_BYTES_PER_SECOND),
      );
    },
    flush(callback) {
      callback(
        received === expectedBytes
          ? null
          : new DemoValidationError("Demo size does not match Content-Length"),
      );
    },
    destroy(err, callback) {
      clearTimeout(timer);
      source.destroy();
      callback(err);
    },
  });
  const onError = (err: Error) => throttled.destroy(err);
  source.on("error", onError);
  source.once("close", () => {
    source.off("error", onError);
    if (!source.readableEnded && !throttled.destroyed)
      throttled.destroy(
        new Error("Demo source closed before the download ended"),
      );
  });
  return source.pipe(throttled);
}
