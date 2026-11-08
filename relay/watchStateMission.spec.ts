import { describe, expect, it } from "vitest";
import {
  decodedPacket,
  remoteCommandEvent,
  serverMessagePacket,
  testCatchupPayload,
} from "./serverPacketFixtures.js";
import { WatchStateAccumulator } from "./watchState.js";

describe("displayed mission identity", () => {
  it("keeps the ended mission through loading and advances at the next drop", () => {
    const state = new WatchStateAccumulator();
    state.applyMissionStart("MissionStartPhase1", ["7", "Katabatic"]);
    state.applyPacket(decodedPacket(remoteCommandEvent("MissionEnd")));
    state.applyMissionStart("MissionStartPhase1", ["8", "Raindance"]);
    state.applyMissionStart("MissionStartPhase3", ["8", "Raindance"]);

    const payload = testCatchupPayload({ watchState: state });
    expect(payload).toMatchObject({
      missionName: "Raindance",
      missionSequence: "8",
      displayedMission: { name: "Katabatic", sequence: "7" },
      hudState: { matchEnded: true },
    });
    const saved = state.save();
    const joiner = new WatchStateAccumulator();
    joiner.seed(payload);
    expect(joiner.displayedMission).toEqual(payload.displayedMission);

    state.applyPacket(serverMessagePacket(["MsgClientReady", "", "CTFGame"]));
    expect(state.displayedMission).toEqual({
      name: "Raindance",
      sequence: "8",
    });
    state.restore(saved);
    expect(state.displayedMission).toEqual({
      name: "Katabatic",
      sequence: "7",
    });
    expect(state.getHudState().matchEnded).toBe(true);
  });

  it("distinguishes same-map restarts after the ended game's debrief", () => {
    const state = new WatchStateAccumulator();
    state.applyMissionStart("MissionStartPhase1", ["7", "Katabatic"]);
    state.applyPacket(decodedPacket(remoteCommandEvent("MissionEnd")));
    state.applyMissionStart("MissionStartPhase3", ["8", "Katabatic"]);
    expect(state.displayedMission?.sequence).toBe("7");
    state.applyPacket(serverMessagePacket(["MsgClientReady", "", "CTFGame"]));
    expect(state.displayedMission?.sequence).toBe("8");
  });

  it("uses the header identity when seeding older payloads", () => {
    const payload = testCatchupPayload();
    delete payload.displayedMission;
    payload.missionName = "Katabatic";
    payload.missionSequence = "7";
    const state = new WatchStateAccumulator();
    state.seed(payload);
    expect(state.displayedMission).toEqual({
      name: "Katabatic",
      sequence: "7",
    });
  });
});
