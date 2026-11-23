import { expect, it, vi } from "vitest";
import { DemoCheckpointRepository } from "./demoCheckpointRepository";
import { DemoStreamAdapter, type DemoSeekCheckpoint } from "./demoStreaming";
import type { DemoCheckpointIndex } from "./demoCheckpoints";
import { fakeDemoParser } from "./streamTestFixtures";
import { installDiagnosticEventSink } from "../diagnostics/events";

const template = new DemoStreamAdapter(fakeDemoParser(), {
  checkpoints: false,
}).captureCheckpoint();
const checkpoint = (tick: number): DemoSeekCheckpoint => ({
  ...template,
  cursor: { ...template.cursor, moveTicks: tick },
});

function index(ticks: number[]): DemoCheckpointIndex {
  let available = ticks;
  return {
    get ticks() {
      return available;
    },
    encodedCharacters: ticks.length,
    load: vi.fn(async (tick) => checkpoint(tick)),
    discard: vi.fn((tick) => {
      available = available.filter((candidate) => candidate !== tick);
    }),
  };
}

it("evicts both decoded owners while preserving the encoded anchor for a later seek", async () => {
  const repository = new DemoCheckpointRepository(
    (decoded) =>
      repository.import(new Map([[decoded.cursor.moveTicks, decoded]]), true),
    { sessionEntries: 2, importedEntries: 2 },
  );
  const source = index([10, 20, 60]);
  repository.installIndex(source);
  repository.import(
    new Map([
      [10, checkpoint(10)],
      [20, checkpoint(20)],
    ]),
    true,
  );
  for (const tick of [30, 40, 50])
    repository.addSession(tick, checkpoint(tick));
  repository.touchImported(10);
  repository.import(new Map([[60, checkpoint(60)]]), true);
  expect(repository.has(20)).toBe(false);
  expect(repository.getImported(20)).toBeUndefined();
  expect(source.discard).not.toHaveBeenCalled();
  expect(repository.getMetrics()).toMatchObject({
    sessionCheckpointEntries: 2,
    persistedCheckpointEntries: 2,
    uniqueCheckpointEntries: 4,
  });
  expect(repository.prepareIndexed(20, 60, true, true)).toBe(true);
  await repository.wait;
  expect(source.load).toHaveBeenCalledWith(20, expect.any(AbortSignal));
  expect(repository.get(20)).toBe(repository.getImported(20)?.checkpoint);
  repository.rejectAnchor(20);
  expect(repository.has(20)).toBe(false);
  expect(repository.getImported(20)).toBeUndefined();
  expect(source.ticks).not.toContain(20);
  repository.dispose();
});

it("keeps imported history separate from prediction eligibility and defaults offline retention to unbounded", () => {
  const repository = new DemoCheckpointRepository(() => {});
  for (let tick = 0; tick < 50; tick++)
    repository.addSession(tick, checkpoint(tick));
  repository.import(
    new Map([
      [60, checkpoint(60)],
      [70, checkpoint(70)],
    ]),
    true,
  );
  expect(repository.getMetrics()).toMatchObject({
    sessionCheckpointEntries: 50,
    persistedCheckpointEntries: 2,
    sessionCheckpointLimit: null,
    importedCheckpointLimit: null,
  });
  repository.clearSession(false);
  expect([...repository.ticks()]).toEqual([]);
  expect(repository.getImported(60)?.checkpoint.cursor.moveTicks).toBe(60);
  repository.clearSession(true);
  expect([...repository.ticks()]).toEqual([60, 70]);
  repository.dispose();
});

it("does not decode an ineligible anchor or one older than an already retained endpoint", () => {
  const repository = new DemoCheckpointRepository(() => {});
  const source = index([20]);
  repository.installIndex(source);
  expect(repository.prepareIndexed(30, 0, true, false)).toBe(false);
  expect(repository.prepareIndexed(30, 0, false, true)).toBe(false);
  expect(repository.prepareIndexed(30, 25, true, true)).toBe(false);
  repository.addSession(25, checkpoint(25));
  expect(repository.nearestTick(30)).toBe(25);
  expect(repository.prepareIndexed(30, 40, true, true)).toBe(false);
  expect(source.load).not.toHaveBeenCalled();
  repository.dispose();
});

it.each(["replace", "dispose"])(
  "ignores a stale decode completion after %s and never clears a newer wait",
  async (action) => {
    let resolve!: (value: DemoSeekCheckpoint) => void;
    let resolveNew!: (value: DemoSeekCheckpoint) => void;
    const accepted = vi.fn();
    const repository = new DemoCheckpointRepository(accepted);
    const old = index([20]);
    vi.mocked(old.load).mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    repository.installIndex(old);
    repository.prepareIndexed(30, 0, true, true);
    const oldWait = repository.wait;
    await Promise.resolve();
    const signal = vi.mocked(old.load).mock.calls[0][1]!;
    const events = vi.fn();
    const stop = installDiagnosticEventSink(events);
    try {
      if (action === "replace") {
        const next = index([40]);
        vi.mocked(next.load).mockReturnValue(
          new Promise((yes) => {
            resolveNew = yes;
          }),
        );
        repository.installIndex(next);
        repository.prepareIndexed(50, 0, true, true);
      } else repository.dispose();
      expect(signal.aborted).toBe(true);
      const newWait = repository.wait;
      resolve(checkpoint(20));
      await oldWait;
      expect(repository.wait).toBe(newWait);
      if (action === "replace") resolveNew(checkpoint(40));
      await newWait;
      expect(accepted).not.toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: expect.objectContaining({ moveTicks: 20 }),
        }),
      );
      expect(
        events.mock.calls.filter(
          ([name, details]) =>
            name !== "checkpoint-decode-start" && details?.tick === 20,
        ),
      ).toEqual([]);
      expect(old.discard).not.toHaveBeenCalled();
    } finally {
      stop();
      repository.dispose();
    }
  },
);

it("rejects a failed encoded decode once and falls back without an endless retry", async () => {
  const repository = new DemoCheckpointRepository(() => {});
  const source = index([20]);
  vi.mocked(source.load).mockRejectedValue(new Error("Corrupt encoded anchor"));
  repository.installIndex(source);
  repository.prepareIndexed(30, 0, true, true);
  await repository.wait;
  expect(source.discard).toHaveBeenCalledExactlyOnceWith(20);
  expect(repository.prepareIndexed(30, 0, true, true)).toBe(false);
  expect(repository.wait).toBeUndefined();
  repository.dispose();
});
