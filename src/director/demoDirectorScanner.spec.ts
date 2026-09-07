import { describe, expect, it, vi } from "vitest";
import { createDirectorScanStream } from "./demoDirectorScanner";
import { DirectorTrackers } from "./directorTrackers";
import type { DirectorFactRecord } from "./factJournal";
import type { StreamSnapshot } from "../stream/types";
import type { DirectorStateFrame } from "./observationContract";
import { DirectorObservationReplay } from "./liveObservation";

function snapshot(timeSec: number): StreamSnapshot {
  return {
    timeSec,
    entities: [],
    playerRoster: [],
    teamScores: [],
    chatMessages: [],
    serverEvents:
      timeSec >= 2.2
        ? [
            {
              id: 1,
              timeSec: 2.2,
              msgType: "MsgCTFFlagDropped",
              args: ["", "", "Runner", "Inferno"],
            },
          ]
        : [],
    matchClockMs: null,
    matchStarted: true,
    matchEnded: false,
    exhausted: false,
    ghostAlwaysDoneSec: null,
  } as unknown as StreamSnapshot;
}

vi.mock("../stream/demoStreaming", () => ({
  createDemoStreamingRecording: async () => ({
    duration: 12.25,
    missionName: "Test",
    gameType: "CTF",
    streamingPlayback: {
      gameClassName: "CTFGame",
      stepToTime: (timeSec: number) => snapshot(timeSec),
    },
  }),
}));

describe("director evidence across sources", () => {
  it("emits identical facts from live snapshots, dynamic demo reads, and batch", async () => {
    const options = { factStreamId: "same-match" };
    const live = new DirectorTrackers(options);
    const dynamic = await createDirectorScanStream(new ArrayBuffer(0), options);
    const batch = await createDirectorScanStream(new ArrayBuffer(0), options);
    const liveRecords: DirectorFactRecord[] = [];
    const demoRecords: DirectorFactRecord[] = [];
    for (let t = 0; t <= 12; t += 0.5) {
      live.step(snapshot(t), t);
      liveRecords.push(...live.drainFacts());
      await dynamic.advanceTo(t);
      demoRecords.push(...dynamic.drainFacts());
    }
    await batch.advanceTo(batch.durationSec);
    expect(demoRecords).toEqual(liveRecords);
    expect(batch.drainFacts()).toEqual(liveRecords);
    expect(liveRecords.map((r) => [r.revision, r.availableAtSec])).toEqual([
      [1, 2.5],
      [2, 10.5],
    ]);
    // No invented observations between the final grid sample and EOF.
    expect(batch.observedThroughSec).toBe(12);
  });

  it("keeps recording optional and repeated reads idempotent", async () => {
    const cameraOnly = await createDirectorScanStream(new ArrayBuffer(0));
    await cameraOnly.advanceTo(5);
    expect(cameraOnly.drainFacts()).toEqual([]);
    expect(cameraOnly.drainStates()).toEqual([]);
    const withFacts = await createDirectorScanStream(new ArrayBuffer(0), {
      factStreamId: "same-match",
    });
    await withFacts.advanceTo(5);
    expect(withFacts.drainFacts()).toHaveLength(1);
    await withFacts.advanceTo(5);
    expect(withFacts.drainFacts()).toEqual([]);
    expect(withFacts.datasetTo(5)).toEqual(cameraOnly.datasetTo(5));
  });

  it("records identical current state from live, dynamic demo, and batch input", async () => {
    const options = { stateStreamId: "same-match" };
    const live = new DirectorTrackers(options);
    const dynamic = await createDirectorScanStream(new ArrayBuffer(0), options);
    const batch = await createDirectorScanStream(new ArrayBuffer(0), options);
    const cameraOnly = await createDirectorScanStream(new ArrayBuffer(0));
    const frames: DirectorStateFrame[] = [];
    for (let t = 0; t <= 12; t += 0.5) {
      live.step(snapshot(t), t);
      await dynamic.advanceTo(t);
      const incoming = dynamic.drainStates();
      expect(incoming).toEqual(live.drainStates());
      frames.push(...incoming);
    }
    await batch.advanceTo(12.25);
    await cameraOnly.advanceTo(12.25);
    expect(batch.drainStates()).toEqual(frames);
    expect(batch.datasetTo(12)).toEqual(cameraOnly.datasetTo(12));
    expect(dynamic.datasetTo(12)).toEqual(cameraOnly.datasetTo(12));
    expect(frames).toHaveLength(13);
    const replay = new DirectorObservationReplay("same-match", frames);
    expect(
      replay.observe({ timeSec: 11.75, availableThroughSec: 12 }).state
        ?.timeSec,
    ).toBe(11);
  });
});
