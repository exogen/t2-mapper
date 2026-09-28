import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildHeader, DEMO_LENGTH_MS_OFFSET } from "./demoWriter";
import {
  validateSourceDemo,
  DemoValidationError,
  DemoTooLargeError,
  MAX_SOURCE_DEMO_BYTES,
  sourceDemoLength,
} from "./demoSourceValidation";

const header = Buffer.from(buildHeader(3));
header.writeUInt32LE(1259725, DEMO_LENGTH_MS_OFFSET);
const data = Buffer.concat([header, Buffer.from([1, 2, 3, 4, 5])]);

describe("source demo validation", () => {
  it("accepts the exact 150 MB limit and rejects one byte over", () => {
    expect(
      sourceDemoLength(
        new Headers({ "Content-Length": String(MAX_SOURCE_DEMO_BYTES) }),
      ),
    ).toBe(150_000_000);
    expect(() =>
      sourceDemoLength(
        new Headers({ "Content-Length": String(MAX_SOURCE_DEMO_BYTES + 1) }),
      ),
    ).toThrow(DemoTooLargeError);
  });

  it.each([null, "0", "-1", "12.5", "1e7", "20, 30"])(
    "rejects missing or invalid source sizes (%s)",
    (size) => {
      const headers = new Headers();
      if (size != null) headers.set("Content-Length", size);
      expect(() => sourceDemoLength(headers)).toThrow("Content-Length");
    },
  );

  it("rejects encoding that would make Content-Length describe compressed bytes", () => {
    expect(() =>
      sourceDemoLength(
        new Headers({ "Content-Length": "100", "Content-Encoding": "gzip" }),
      ),
    ).toThrow("unencoded");
  });
  it.each([1, 7, data.length])(
    "reads headers split into %i-byte chunks without changing the stream",
    async (size) => {
      const body = Readable.from(
        (async function* () {
          for (let i = 0; i < data.length; i += size)
            yield data.subarray(i, i + size);
        })(),
        { objectMode: false },
      );
      expect(await validateSourceDemo(body)).toMatchObject({
        protocolVersion: 0x330004,
        demoLengthMs: 1259725,
      });
      const output: Buffer[] = [];
      for await (const chunk of body) output.push(chunk);
      expect(Buffer.concat(output)).toEqual(data);
    },
  );

  it.each(["version", "identifier", "truncated"])(
    "rejects an invalid %s",
    async (invalid) => {
      let bytes = Buffer.from(data);
      if (invalid === "version")
        bytes.writeUInt32LE(0x330003, DEMO_LENGTH_MS_OFFSET - 4);
      if (invalid === "identifier") bytes[1] = 88;
      if (invalid === "truncated") bytes = bytes.subarray(0, 12);
      const body = Readable.from([bytes]);
      try {
        await expect(validateSourceDemo(body)).rejects.toBeInstanceOf(
          DemoValidationError,
        );
      } finally {
        body.destroy();
      }
    },
  );
});
