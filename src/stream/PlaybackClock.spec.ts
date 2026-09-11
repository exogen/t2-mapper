import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  BitWriter,
  BlockTypeMove,
  DemoIdentString,
  DemoParser,
  DemoProtocolVersion,
} from "t2-demo-parser";
import { engineStore } from "../state/engineStore";
import { PlaybackClock } from "./PlaybackClock";
import {
  createRecordingFromParser,
  DEMO_CHECKPOINT_TICKS,
} from "./demoStreaming";
import { STREAM_TICK_SEC } from "./streamHelpers";

// A real wire-format recording: an empty from-connect start block followed
// by 33 minutes of neutral moves. Keep the installed parser unmocked so a
// dependency missing checkpoint support cannot pass these playback tests.
function emptyDemo(ticks: number): Uint8Array {
  const bs = new BitWriter();
  for (let i = 0; i < 1024; i++) bs.writeFlag(false); // tagged strings
  bs.writeU32(0).writeFlag(false); // datablocks
  bs.writeU8(1); // first person
  for (let i = 0; i < 6 + 16; i++) bs.writeU32(0); // connection/move state
  bs.writeU32(0); // pending moves
  bs.writeFlag(true).writeString("Standard\t\t\t0\t0\t");
  bs.writeFlag(false); // demo values terminator
  for (let i = 0; i < 4; i++) bs.writeU8(0); // target manager header
  for (let i = 0; i < 32 * 32 + 512; i++) bs.writeFlag(false);
  for (let i = 0; i < 32 + 7; i++) bs.writeU32(0); // connection protocol
  bs.writeU8(1); // established
  for (let i = 0; i < 5; i++) bs.writeU32(0); // RTT/loss, paths, notifies, events
  bs.writeFlag(false); // queued events
  bs.writeU32(0).writeFlag(false); // ghosting sequence and ghosts
  bs.writeU32(0xffffffff); // no control object
  bs.writeString("Katabatic").writeU32(0); // mission and CRC
  for (let i = 0; i < 2; i++) {
    bs.writeU8(0);
    for (let j = 0; j < 4; j++) bs.writeU32(0);
  }
  const initial = bs.finish(1);
  const header = Buffer.alloc(1 + DemoIdentString.length + 12);
  header[0] = DemoIdentString.length;
  header.write(DemoIdentString, 1, "latin1");
  const offset = 1 + DemoIdentString.length;
  header.writeUInt32LE(DemoProtocolVersion, offset);
  header.writeUInt32LE(ticks * 32, offset + 4);
  header.writeUInt32LE(initial.length, offset + 8);
  const moves = Buffer.alloc(ticks * 66);
  for (let tick = 0; tick < ticks; tick++)
    moves.writeUInt16LE((BlockTypeMove << 12) | 64, tick * 66);
  return Buffer.concat([header, initial, deflateRawSync(moves)]);
}

const bytes = emptyDemo(62_000);
async function setup() {
  const parser = new DemoParser(bytes);
  await parser.load();
  const recording = createRecordingFromParser(parser);
  const stream = recording.streamingPlayback;
  engineStore.getState().setRecording(recording);
  engineStore.getState().setPlaybackStatus("playing");
  const clock = new PlaybackClock();
  clock.reset(0, engineStore.getState().playback.seekNonce);
  return {
    parser,
    stream,
    clock,
    frame: (delta = 1 / 60) =>
      clock.step(stream, engineStore.getState().playback, delta),
  };
}

describe("playback clock with the installed demo parser", () => {
  it.each([0.25, 1, 8])(
    "seeks from 32:00 to 20:00 at %sx, then resumes at selected 1x",
    async (rate) => {
      const { stream, clock, frame } = await setup();
      engineStore.getState().setPlaybackRate(rate);
      engineStore.getState().seekPlayback(1920);
      frame();
      frame(10); // discard time spent performing the synchronous seek
      for (let i = 0; i < 60; i++) frame();
      expect(clock.time).toBeCloseTo(1920 + rate);
      const checkpoints = Array.from(
        { length: 7 },
        (_, i) => (i + 1) * DEMO_CHECKPOINT_TICKS,
      );
      expect(stream.checkpointTicks).toEqual(checkpoints);

      engineStore.getState().seekPlayback(1200);
      const result = frame();
      expect(clock.time).toBe(1200);
      expect(result.seekPrevious?.timeSec).toBe(1200);
      expect(result.snapshot.timeSec).toBeCloseTo(1200 + STREAM_TICK_SEC);
      expect(stream.checkpointTicks).toEqual(checkpoints);
      engineStore.getState().setPlaybackRate(1);
      frame(10);
      expect(clock.time).toBe(1200);
      for (let i = 0; i < 60; i++) frame();
      expect(engineStore.getState().playback.rate).toBe(1);
      expect(clock.time).toBeCloseTo(1201);
      expect(Math.abs(stream.getSnapshot().timeSec - clock.time)).toBeLessThan(
        STREAM_TICK_SEC,
      );
    },
  );

  it("keeps an interrupted seek pending instead of consuming frame budgets to catch up", async () => {
    const { parser, stream, clock, frame } = await setup();
    const nonce = clock.seekNonce;
    vi.spyOn(parser, "createCheckpoint").mockImplementationOnce(() => {
      throw new Error("checkpoint failed");
    });
    engineStore.getState().setPlaybackRate(8);
    engineStore.getState().seekPlayback(1920);
    expect(() => frame()).toThrow("checkpoint failed");
    expect(stream.getSnapshot().timeSec).toBe(256);
    expect(clock.time).toBe(0);
    expect(clock.seekNonce).toBe(nonce);

    engineStore.getState().setPlaybackRate(1);
    const result = frame(10);
    expect(result.isSeeking).toBe(true);
    expect(clock.time).toBe(1920);
    expect(clock.seekNonce).toBe(engineStore.getState().playback.seekNonce);
    frame(10);
    for (let i = 0; i < 60; i++) frame();
    expect(clock.time).toBeCloseTo(1921);
    expect(stream.getSnapshot().timeSec).toBeCloseTo(1921.024);
  });

  it("acknowledges a seek only after both interpolation endpoints succeed", async () => {
    const { stream, clock, frame } = await setup();
    const step = stream.stepToTime.bind(stream);
    vi.spyOn(stream, "stepToTime")
      .mockImplementationOnce(step)
      .mockImplementationOnce(() => {
        throw new Error("next tick failed");
      });
    engineStore.getState().seekPlayback(1200);
    expect(() => frame()).toThrow("next tick failed");
    expect(clock.time).toBe(0);
    expect(clock.seekNonce).not.toBe(engineStore.getState().playback.seekNonce);
    expect(frame().isSeeking).toBe(true);
    expect(clock.time).toBe(1200);
  });

  it("preserves fractional seek time while paused and applies speed changes on the next frame", async () => {
    const { clock, frame } = await setup();
    engineStore.getState().setPlaybackStatus("paused");
    engineStore.getState().setPlaybackRate(8);
    engineStore.getState().seekPlayback(1200.015);
    const result = frame();
    expect(result.seekPrevious?.timeSec).toBe(1200);
    expect(result.snapshot.timeSec).toBeCloseTo(1200.032);
    frame(5);
    expect(clock.time).toBe(1200.015);
    engineStore.getState().setPlaybackStatus("playing");
    frame(0.1);
    expect(clock.time).toBeCloseTo(1200.815);
    engineStore.getState().setPlaybackRate(0.25);
    frame(0.1);
    expect(clock.time).toBeCloseTo(1200.84);
  });
});
