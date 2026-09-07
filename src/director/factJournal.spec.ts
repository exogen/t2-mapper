import { describe, expect, it } from "vitest";
import {
  DirectorFactJournal,
  DirectorFactReplay,
  type DirectorFactRecord,
} from "./factJournal";
import type { DirectorEvent } from "./types";

function drop(): DirectorEvent {
  return {
    timeSec: 2,
    type: "flag-drop",
    description: "Runner dropped the flag",
    actor: "Runner",
    pos: [10, 20, 30],
  };
}

describe("director fact journal", () => {
  it("keeps detached revisions and stable identity across drains", () => {
    const journal = new DirectorFactJournal("match-a");
    const event = drop();
    journal.record("event", event, 2.5);
    const first = journal.drain();
    event.dropKind = "pass";
    event.pos![0] = 99;
    journal.record("event", event, 10);
    journal.record("event", event, 11);
    const second = journal.drain();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toMatchObject({
      sequence: 1,
      revision: 1,
      timeSec: 2,
      availableAtSec: 2.5,
      value: { pos: [10, 20, 30] },
    });
    expect(
      first[0].kind === "event" && first[0].value.dropKind,
    ).toBeUndefined();
    expect(second[0]).toMatchObject({
      id: first[0].id,
      sequence: 2,
      revision: 2,
      availableAtSec: 10,
      value: { dropKind: "pass", pos: [99, 20, 30] },
    });
    expect(Object.isFrozen(first[0].value)).toBe(true);
    expect(Object.isFrozen((first[0].value as DirectorEvent).pos)).toBe(true);
    expect(journal.drain()).toEqual([]);
  });

  it("does not turn archive finalization into a live observation", () => {
    const journal = new DirectorFactJournal("match-a");
    const event = drop();
    journal.record("event", event, 2);
    event.dropKind = "pass";
    journal.record("event", event, Infinity);
    const records = journal.drain();
    expect(records).toHaveLength(1);
    expect(
      records[0].kind === "event" && records[0].value.dropKind,
    ).toBeUndefined();
  });

  it("separates simultaneous facts and stream epochs", () => {
    const a = new DirectorFactJournal("match-a");
    const b = new DirectorFactJournal("match-b");
    a.record("event", drop(), 2);
    a.record("event", drop(), 2);
    b.record("event", drop(), 2);
    const first = a.drain();
    expect(first.map((r) => r.id)).toEqual(["event:1", "event:2"]);
    expect(b.drain()[0].streamId).not.toBe(first[0].streamId);
  });
});

describe("availability-ordered fact replay", () => {
  function records(): DirectorFactRecord[] {
    const journal = new DirectorFactJournal("match-a");
    const event = drop();
    journal.record("event", event, 2.5);
    event.dropKind = "pass";
    journal.record("event", event, 10);
    return journal.drain();
  }

  it("reveals a pass at its availability time, not at the earlier drop", () => {
    const replay = new DirectorFactReplay(records());
    expect(replay.advanceTo(2)).toEqual([]);
    const raw = replay.advanceTo(2.5);
    expect(raw).toHaveLength(1);
    expect(raw[0].kind === "event" && raw[0].value.dropKind).toBeUndefined();
    expect(replay.advanceTo(9.99)).toEqual([]);
    expect(replay.advanceTo(10)[0]).toMatchObject({
      revision: 2,
      value: { dropKind: "pass" },
    });
    expect(replay.advanceTo(10)).toEqual([]);
    expect(() => replay.advanceTo(9)).toThrow(/clock/);
  });

  it("produces the same evidence for dynamic and batch reads", () => {
    const trace = records();
    const dynamic = new DirectorFactReplay(trace);
    const emitted: DirectorFactRecord[] = [];
    for (let t = 0; t <= 12; t += 0.5) emitted.push(...dynamic.advanceTo(t));
    expect(emitted).toEqual(new DirectorFactReplay(trace).advanceTo(12));
    // The suffix cannot alter the data returned at an earlier clock.
    expect(new DirectorFactReplay(trace).advanceTo(3)).toEqual(
      new DirectorFactReplay(trace.slice(0, 1)).advanceTo(3),
    );
  });

  it("refuses reordered, missing, mixed-stream or impossible revisions", () => {
    const trace = records();
    for (const invalid of [
      [...trace].reverse(),
      trace.slice(1),
      [trace[0], { ...trace[1], streamId: "other" }],
      [{ ...trace[0], availableAtSec: 1 }],
      [trace[0], { ...trace[1], revision: 3 }],
    ]) {
      expect(() => new DirectorFactReplay(invalid)).toThrow(/Invalid/);
    }
  });
});
