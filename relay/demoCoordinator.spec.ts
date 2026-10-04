import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoCoordinator } from "./demoCoordinator";
import type { MissionControlState } from "./missionControls";
import { demoLog } from "./logger";

describe("demo retention at match end", () => {
  let dir: string;
  let published: string[];
  let coordinator: DemoCoordinator;
  const address = "1.2.3.4:28000";
  const mission: [string, string] = ["1", "Katabatic"];
  const hour = 60 * 60_000;
  const controls = (
    recording: boolean,
    complete = false,
  ): MissionControlState => ({
    mission,
    recording,
    watching: true,
    ...(complete && { recordingDecision: recording }),
  });

  function createCoordinator() {
    return new DemoCoordinator({
      enabled: true,
      dir,
      minFreeBytes: 0,
      maxBytes: 10_000_000,
      minLengthMs: 0,
      minPlayers: 0,
      recorderName: "MapGenius",
      onFinalized: (file) => published.push(file),
    });
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "demo-retention-"));
    published = [];
    coordinator = createCoordinator();
  });
  afterEach(async () => {
    await coordinator.shutdown(5000);
    await fs.rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function held(
    name: string,
    keep: boolean,
    complete = false,
    savedMission = mission,
    inactiveSince?: number,
  ) {
    const folder = path.join(dir, "pending", name);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      path.join(folder, "policy.json"),
      JSON.stringify({
        address,
        mission: savedMission,
        keep,
        complete,
        inactiveSince,
      }),
    );
    await fs.writeFile(path.join(folder, `${name}.rec`), `footage: ${name}`);
    await fs.writeFile(
      path.join(folder, `${name}.rec.json`),
      JSON.stringify({ filename: `${name}.rec` }),
    );
    return folder;
  }

  async function expectOnlyJournals(...names: string[]) {
    for (const name of names)
      expect(await fs.readdir(path.join(dir, "pending", name))).toEqual([
        "policy.json",
      ]);
  }

  async function restart() {
    await coordinator.shutdown(5_000);
    coordinator = createCoordinator();
    await coordinator.restorePending();
  }

  function recorder(matchStarted = false) {
    return coordinator.createRecorder({
      address,
      getConnectSequence: () => 1,
      getServerInfo: () => undefined,
      getServerIdentity: () => ({}),
      getActivePlayerCount: () => 0,
      getPlayerRoster: () => new Map(),
      getRecorderClientId: () => null,
      getMatchStarted: () => matchStarted,
    })!;
  }

  it.each([true, false])(
    "settles an inactive mission after one hour across repeated restarts: keep=%s",
    async (keep) => {
      const stoppedAt = Date.now();
      const now = vi.spyOn(Date, "now").mockReturnValue(stoppedAt);
      const folder = await held("waiting", keep, false, mission, stoppedAt);
      await coordinator.restorePending();
      for (const elapsed of [30 * 60_000, hour - 1]) {
        now.mockReturnValue(stoppedAt + elapsed);
        await restart();
        await coordinator.sweepPending();
        expect(published).toEqual([]);
        const policy = JSON.parse(
          await fs.readFile(path.join(folder, "policy.json"), "utf8"),
        );
        expect(policy).toMatchObject({
          inactiveSince: stoppedAt,
          complete: false,
        });
        expect(
          await fs.readFile(path.join(folder, "waiting.rec"), "utf8"),
        ).toBe("footage: waiting");
      }
      now.mockReturnValue(stoppedAt + hour);
      await restart();
      expect(published).toEqual(keep ? [path.join(dir, "waiting.rec")] : []);
      await expectOnlyJournals("waiting");
      expect(coordinator.takeRestoredPolicy(address, mission)).toEqual({
        recording: keep,
        recordingDecision: keep,
      });
      await restart();
      expect(coordinator.takeRestoredPolicy(address, mission)).toEqual({
        recording: keep,
        recordingDecision: keep,
      });
      expect(published).toHaveLength(keep ? 1 : 0);
    },
  );

  it("settles all segments together using the most recent inactivity time", async () => {
    const stoppedAt = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(stoppedAt);
    await held("older", true, false, mission, stoppedAt - hour);
    await held("newer", true, false, mission, stoppedAt - 10 * 60_000);
    await coordinator.restorePending();
    expect(published).toEqual([]);
    now.mockReturnValue(stoppedAt + 50 * 60_000);
    await coordinator.sweepPending();
    expect(published.map((file) => path.basename(file)).sort()).toEqual([
      "newer.rec",
      "older.rec",
    ]);
  });

  it("protects earlier segments during reconnect and restarts the hour after the last recorder stops", async () => {
    const startedAt = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAt);
    const folder = await held("earlier", false, false, mission, startedAt);
    await coordinator.restorePending();
    const active = recorder();
    now.mockReturnValue(startedAt + 2 * hour);
    // Even before Phase1, the new connection may belong to the held mission.
    await coordinator.sweepPending();
    coordinator.observeMission(active, address, controls(false));
    await coordinator.sweepPending();
    expect(await fs.readFile(path.join(folder, "earlier.rec"), "utf8")).toBe(
      "footage: earlier",
    );
    coordinator.finalize(active, "disconnected");
    await vi.waitFor(() => expect(coordinator.getStats().finalizing).toBe(0));
    expect(
      JSON.parse(await fs.readFile(path.join(folder, "policy.json"), "utf8")),
    ).toMatchObject({ inactiveSince: startedAt + 2 * hour, complete: false });
    now.mockReturnValue(startedAt + 3 * hour - 1);
    await restart();
    expect(await fs.readdir(folder)).toContain("earlier.rec");
    now.mockReturnValue(startedAt + 3 * hour);
    await coordinator.sweepPending();
    await expectOnlyJournals("earlier");
    expect(published).toEqual([]);
  });

  it("recovers a missing detach timestamp from recent file activity without resetting it on later boots", async () => {
    const crashedAt = Date.now();
    const lastWrite = crashedAt - 10 * 60_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(crashedAt);
    const folder = await held("crashed", false);
    for (const name of await fs.readdir(folder)) {
      const date = new Date(
        name === "policy.json" ? crashedAt - 3 * hour : lastWrite,
      );
      await fs.utimes(path.join(folder, name), date, date);
    }
    await coordinator.restorePending();
    const policy = JSON.parse(
      await fs.readFile(path.join(folder, "policy.json"), "utf8"),
    );
    expect(policy.inactiveSince).toBeCloseTo(lastWrite, 0);
    now.mockReturnValue(crashedAt + 40 * 60_000);
    await restart();
    expect(await fs.readdir(folder)).toContain("crashed.rec");
    expect(
      JSON.parse(await fs.readFile(path.join(folder, "policy.json"), "utf8")),
    ).toEqual(policy);
    now.mockReturnValue(crashedAt + 51 * 60_000);
    await restart();
    await expectOnlyJournals("crashed");
  });

  it("persists a real recording's detach time and releases it after downtime exceeds an hour", async () => {
    const startedAt = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAt);
    const active = recorder(true);
    coordinator.observeMission(active, address, controls(true));
    active.onPacket(new Uint8Array([1, 2, 3]));
    active.setMissionName("Katabatic", 1);
    const folder = path.dirname(active.partialPath!);
    now.mockReturnValue(startedAt + 10_000);
    coordinator.finalize(active, "disconnected");
    await vi.waitFor(() => expect(coordinator.getStats().finalizing).toBe(0));
    expect(
      JSON.parse(await fs.readFile(path.join(folder, "policy.json"), "utf8")),
    ).toMatchObject({ inactiveSince: startedAt + 10_000, complete: false });
    expect(published).toEqual([]);
    now.mockReturnValue(startedAt + 10_000 + hour);
    await restart();
    expect(published).toHaveLength(1);
    expect(await fs.readFile(published[0])).not.toHaveLength(0);
    expect(await fs.readdir(folder)).toEqual(["policy.json"]);
  });

  it("keeps all files private if saving any segment's timeout decision fails", async () => {
    const stoppedAt = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(stoppedAt);
    const first = await held("first", true, false, mission, stoppedAt);
    const second = await held("second", true, false, mission, stoppedAt);
    await coordinator.restorePending();
    now.mockReturnValue(stoppedAt + hour);
    const rename = fsSync.renameSync;
    const failing = vi
      .spyOn(fsSync, "renameSync")
      .mockImplementationOnce(rename)
      .mockImplementationOnce(() => {
        throw new Error("disk unavailable");
      });
    await coordinator.sweepPending();
    expect(published).toEqual([]);
    expect(await fs.readdir(first)).toContain("first.rec");
    expect(await fs.readdir(second)).toContain("second.rec");
    failing.mockRestore();
    await coordinator.sweepPending();
    expect(published).toHaveLength(2);
  });

  it.each(["match-end", "mission-change"] as const)(
    "holds every segment after a %s journal write fails, then retries",
    async (reason) => {
      const first = await held("first", true);
      const second = await held("second", true);
      await coordinator.restorePending();
      const rename = fsSync.renameSync;
      const failing = vi
        .spyOn(fsSync, "renameSync")
        .mockImplementation((from, to) => {
          if (to === path.join(second, "policy.json"))
            throw new Error("disk unavailable");
          return rename(from, to);
        });
      expect(() => {
        if (reason === "match-end")
          coordinator.updateMission(address, controls(true, true));
        else
          coordinator.observeMission(null, address, {
            ...controls(true),
            mission: ["2", "Raindance"],
          });
      }).not.toThrow();
      await coordinator.sweepPending();
      expect(published).toEqual([]);
      expect(await fs.readdir(first)).toContain("first.rec");
      expect(await fs.readdir(second)).toContain("second.rec");
      failing.mockRestore();
      await coordinator.sweepPending();
      expect(published).toHaveLength(2);
    },
  );

  it.each(["match-end", "mission-change", "inactivity-timeout"] as const)(
    "logs and preserves the %s decision through recovery and file release",
    async (decisionReason) => {
      const stoppedAt = Date.now();
      const now = vi.spyOn(Date, "now").mockReturnValue(stoppedAt);
      const info = vi.spyOn(demoLog, "info").mockImplementation(() => {});
      await held("saved", true, false, mission, stoppedAt);
      await coordinator.restorePending();
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          address,
          mission,
          action: "hold",
          keep: true,
          complete: false,
        }),
        "Pending mission recording policy restored",
      );
      if (decisionReason === "match-end")
        coordinator.updateMission(address, controls(true, true), "match-end");
      else if (decisionReason === "mission-change")
        coordinator.observeMission(null, address, {
          ...controls(true),
          mission: ["2", "Raindance"],
        });
      else now.mockReturnValue(stoppedAt + hour);
      await coordinator.sweepPending();
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          address,
          mission,
          recordingId: "saved",
          file: "saved.rec",
          decisionReason,
          keep: true,
          complete: true,
        }),
        "Recording released from pending storage",
      );
      if (decisionReason !== "mission-change") {
        info.mockClear();
        await restart();
        expect(info).toHaveBeenCalledWith(
          expect.objectContaining({
            address,
            mission,
            decisionReason,
            action: "release",
          }),
          "Pending mission recording policy restored",
        );
      }
    },
  );

  it("logs conservative reconciliation and the files discarded after conflicting journals", async () => {
    const info = vi.spyOn(demoLog, "info").mockImplementation(() => {});
    await held("discard", false, true);
    await held("stale", true);
    await coordinator.restorePending();
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        conflictingJournals: true,
        keep: false,
        complete: true,
        action: "discard",
      }),
      "Pending mission recording policy restored",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: "stale",
        action: "discard",
        files: expect.arrayContaining(["stale.rec"]),
      }),
      "Match recording decision applied",
    );
    expect(published).toEqual([]);
  });

  it.each([true, false])(
    "holds interrupted segments across restart until the final choice: keep=%s",
    async (keep) => {
      await held("first", true);
      await held("second", false);
      await coordinator.restorePending();
      await coordinator.sweepPending();
      expect(published).toEqual([]);
      expect(await fs.readdir(dir)).toEqual(["pending"]);
      coordinator.updateMission(address, controls(keep));
      await coordinator.sweepPending();
      expect(published).toEqual([]);
      coordinator.updateMission(address, controls(keep, true));
      await coordinator.sweepPending();
      expect(published.map((file) => path.basename(file)).sort()).toEqual(
        keep ? ["first.rec", "second.rec"] : [],
      );
      await expectOnlyJournals("first", "second");
      if (keep) {
        expect(await fs.readFile(path.join(dir, "first.rec"), "utf8")).toBe(
          "footage: first",
        );
        expect(
          JSON.parse(
            await fs.readFile(path.join(dir, "first.rec.json"), "utf8"),
          ),
        ).toEqual({ filename: "first.rec" });
      }
    },
  );

  it("recovers completed decisions without publishing incomplete matches", async () => {
    await held("keep", true, true);
    await held("discard", false, true, ["2", "Katabatic"]);
    const waiting = await held("waiting", false, false, ["3", "Katabatic"]);
    await coordinator.restorePending();
    expect(published).toEqual([path.join(dir, "keep.rec")]);
    await expectOnlyJournals("keep", "discard");
    expect(await fs.readFile(path.join(waiting, "waiting.rec"), "utf8")).toBe(
      "footage: waiting",
    );
  });

  it("restores the journaled choice once if the watch-state file lagged behind", async () => {
    await held("first", false);
    await held("second", true);
    await coordinator.restorePending();
    expect(coordinator.takeRestoredPolicy(address, mission)).toEqual({
      recording: false,
    });
    expect(coordinator.takeRestoredPolicy(address, mission)).toBeUndefined();
    coordinator.updateMission(address, controls(true, true));
    await coordinator.sweepPending();
    expect(published).toHaveLength(2);
  });

  it("uses the private choice for every interrupted segment when reconnecting on a new mission", async () => {
    await held("updated", false);
    await held("stale", true);
    await coordinator.restorePending();
    coordinator.observeMission(null, address, {
      ...controls(true),
      mission: ["2", "Raindance"],
    });
    await coordinator.sweepPending();
    expect(published).toEqual([]);
    expect(await fs.readdir(path.join(dir, "pending"))).toEqual([]);
  });

  it("restores the final restriction even after its completed files were swept", async () => {
    await held("discard", false, true);
    await coordinator.restorePending();
    await expectOnlyJournals("discard");
    expect(coordinator.takeRestoredPolicy(address, mission)).toEqual({
      recording: false,
      recordingDecision: false,
    });
  });

  it("keeps the completed policy through repeated crashes until the next mission is known", async () => {
    await held("discard", false, true);
    for (let restart = 0; restart < 3; restart++) {
      await coordinator.shutdown(5_000);
      coordinator = createCoordinator();
      await coordinator.restorePending();
      expect(coordinator.takeRestoredPolicy(address, mission)).toEqual({
        recording: false,
        recordingDecision: false,
      });
      await expectOnlyJournals("discard");
      expect(published).toEqual([]);
    }
    coordinator.observeMission(null, address, {
      ...controls(true),
      mission: ["2", "Katabatic"],
    });
    await coordinator.sweepPending();
    expect(await fs.readdir(path.join(dir, "pending"))).toEqual([]);
  });

  it("reconciles a partly committed final decision before the boot sweep", async () => {
    await held("decided", false, true);
    await held("stale", true);
    await coordinator.restorePending();
    expect(published).toEqual([]);
    await expectOnlyJournals("decided", "stale");
    expect(coordinator.takeRestoredPolicy(address, mission)).toEqual({
      recording: false,
      recordingDecision: false,
    });
  });

  it("does not let new-map defaults overwrite the saved choice for an interrupted match", async () => {
    await held("old", false);
    await coordinator.restorePending();
    coordinator.observeMission(null, address, {
      ...controls(true),
      mission: ["2", "Katabatic"],
    });
    await coordinator.sweepPending();
    expect(published).toEqual([]);
    expect(await fs.readdir(path.join(dir, "pending"))).toEqual([]);
  });

  it("locks the decision before asynchronous release, ignoring later changes", async () => {
    await held("old", false);
    await coordinator.restorePending();
    coordinator.updateMission(address, controls(false, true));
    coordinator.updateMission(address, controls(true));
    await coordinator.sweepPending();
    expect(published).toEqual([]);
    await expectOnlyJournals("old");
  });

  it.each([true, false])(
    "applies only the final decision after rapid reversals across all held segments: keep=%s",
    async (keep) => {
      await held("first", true);
      await held("second", true);
      await coordinator.restorePending();
      for (let i = 0; i < 100; i++)
        coordinator.updateMission(address, controls(i % 2 === 0));
      expect(published).toEqual([]);
      expect(await fs.readdir(dir)).toEqual(["pending"]);
      coordinator.updateMission(address, controls(keep, true));
      for (let i = 0; i < 100; i++)
        coordinator.updateMission(address, controls(!keep));
      await coordinator.sweepPending();
      expect(published.map((file) => path.basename(file)).sort()).toEqual(
        keep ? ["first.rec", "second.rec"] : [],
      );
      expect(coordinator.getStats()).toMatchObject({
        kept: keep ? 2 : 0,
        dropped: keep ? 0 : 2,
      });
      await expectOnlyJournals("first", "second");
      await coordinator.sweepPending();
      expect(coordinator.getStats()).toMatchObject({
        kept: keep ? 2 : 0,
        dropped: keep ? 0 : 2,
      });
    },
  );

  it("retains files locally if the policy cannot be read", async () => {
    const folder = await held("unknown", true, true);
    await fs.writeFile(path.join(folder, "policy.json"), "broken");
    await coordinator.restorePending();
    expect(published).toEqual([]);
    expect(await fs.readFile(path.join(folder, "unknown.rec"), "utf8")).toBe(
      "footage: unknown",
    );
  });

  it("removes empty pre-handshake journals after a crash, preserving unknown footage and mission decisions", async () => {
    const empty = path.join(dir, "pending", "empty");
    await fs.mkdir(empty, { recursive: true });
    const policy = JSON.stringify({
      address,
      mission: null,
      keep: true,
      complete: false,
    });
    await fs.writeFile(path.join(empty, "policy.json"), policy);
    await fs.writeFile(path.join(empty, "policy.json.tmp"), policy);
    const unknown = await held("unknown", true);
    await fs.writeFile(path.join(unknown, "policy.json"), policy);
    const decided = await held("decided", false, true);
    await coordinator.restorePending();
    expect(await fs.stat(empty).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(unknown, "unknown.rec"), "utf8")).toBe(
      "footage: unknown",
    );
    expect(await fs.readdir(decided)).toEqual(["policy.json"]);
    expect(published).toEqual([]);
  });
});
