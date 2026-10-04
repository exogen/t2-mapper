import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { DemoMetadata } from "../relay/demoRecorder";

const mocks = vi.hoisted(() => ({
  r2Client: vi.fn(),
  list: vi.fn(),
  analyze: vi.fn(),
  send: vi.fn(),
}));
vi.mock("./lib/r2", () => ({
  r2Client: mocks.r2Client,
  listAllObjects: mocks.list,
}));
vi.mock("./lib/analyzeDemo", () => ({ analyzeDemo: mocks.analyze }));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const original: DemoMetadata = {
  filename: "old.rec",
  bytes: 1,
  recordedAt: "2026-09-01T00:00:00Z",
  server: "Server",
  address: "localhost",
  games: [],
  mod: "classic",
  recorder: "MapGenius",
  durationMs: 60_000,
  players: [],
};
const repaired = {
  ...original,
  games: [
    {
      mission: "Katabatic",
      missionSequence: 41,
      gameType: "CTF",
      startMs: 0,
      tournament: false,
    },
  ],
};
const added = { ...original, filename: "new.rec" };
const late = { ...original, filename: "late.rec" };
let index: DemoMetadata[];
let version: number;
let beforeIndexPut: (() => void) | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.argv = ["node", "backfill-demo-index.ts", "--force"];
  process.exitCode = undefined;
  index = [original, added];
  version = 1;
  beforeIndexPut = undefined;
  mocks.r2Client.mockReturnValue({
    client: { send: mocks.send },
    config: { bucket: "bucket", prefix: "demos/" },
  });
  // The new upload wasn't present when the backfill listed the bucket.
  mocks.list.mockResolvedValue([
    { key: "demos/old.rec", size: 1 },
    { key: "demos/old.rec.json", size: 1 },
  ]);
  mocks.analyze.mockResolvedValue(repaired);
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof GetObjectCommand) {
      const body = JSON.stringify(
        command.input.Key === "demos/index.json" ? index : original,
      );
      return {
        ETag: `"${version}"`,
        Body: {
          transformToString: async () => body,
          transformToByteArray: async () => Buffer.from(body),
        },
      };
    }
    if (
      command instanceof PutObjectCommand &&
      command.input.Key === "demos/index.json"
    ) {
      beforeIndexPut?.();
      beforeIndexPut = undefined;
      if (command.input.IfMatch && command.input.IfMatch !== `"${version}"`)
        throw Object.assign(new Error("conflict"), {
          name: "PreconditionFailed",
        });
      index = JSON.parse(command.input.Body as string);
      version++;
    }
    return {};
  });
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

it.each([false, true])(
  "preserves uploads made during a full backfill (write conflict=%s)",
  async (conflict) => {
    if (conflict)
      beforeIndexPut = () => {
        index.push(late);
        version++;
      };
    await import("./backfill-demo-index");
    expect(index).toContainEqual(repaired);
    expect(index).toContainEqual(added);
    if (conflict) expect(index).toContainEqual(late);
    expect(index).toHaveLength(conflict ? 3 : 2);
    const puts = mocks.send.mock.calls.flatMap(([command]) =>
      command instanceof PutObjectCommand &&
      command.input.Key === "demos/index.json"
        ? [command.input]
        : [],
    );
    expect(puts.map((input) => input.IfMatch)).toEqual(
      conflict ? ['"1"', '"2"'] : ['"1"'],
    );
  },
);

it("writes nothing in dry-run mode", async () => {
  process.argv.push("--dry-run");
  await import("./backfill-demo-index");
  expect(
    mocks.send.mock.calls.some(
      ([command]) => command instanceof PutObjectCommand,
    ),
  ).toBe(false);
});

it("preserves non-player metadata in players-only mode", async () => {
  process.argv.push("--players-only");
  index = [{ ...original, hasCommentary: true }, added];
  mocks.analyze.mockResolvedValue({
    ...repaired,
    players: ["Alice"],
    playerCount: 1,
  });
  await import("./backfill-demo-index");
  expect(index).toEqual([
    { ...original, hasCommentary: true, players: ["Alice"], playerCount: 1 },
    added,
  ]);
});

it("leaves the index alone when a demo fails to analyze", async () => {
  mocks.analyze.mockRejectedValue(new Error("broken demo"));
  await import("./backfill-demo-index");
  expect(index).toEqual([original, added]);
  expect(
    mocks.send.mock.calls.some(
      ([command]) => command instanceof PutObjectCommand,
    ),
  ).toBe(false);
  expect(process.exitCode).toBe(1);
});
