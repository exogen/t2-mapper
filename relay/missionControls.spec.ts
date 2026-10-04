import { describe, expect, it } from "vitest";
import {
  decodeGlobalChat,
  loadAdminVotePolicies,
  MissionControls,
  parseMissionControlCommand,
  selectAdminVotesRequired,
} from "./missionControls";

describe("admin vote policies", () => {
  const policies = [
    { tournament: true, minPlayerCount: 20, adminVotes: 2 },
    { tournament: false, minPlayerCount: 1, adminVotes: 1 },
    { tournament: true, minPlayerCount: 1, adminVotes: 1 },
  ];

  it.each([undefined, "", "  "])(
    "loads the default policies for %j",
    (value) => {
      const loaded = loadAdminVotePolicies(value);
      expect(loaded).toEqual([]);
      expect(selectAdminVotesRequired(loaded, true, 20)).toBeNull();
      expect(selectAdminVotesRequired(loaded, false, 20)).toBeNull();
    },
  );

  it("allows an empty array to disable admin controls everywhere", () => {
    const loaded = loadAdminVotePolicies("[]");
    expect(loaded).toEqual([]);
    for (const mode of [true, false, null])
      expect(selectAdminVotesRequired(loaded, mode, 20)).toBeNull();
  });

  it("loads a JSON array of policies", () => {
    expect(loadAdminVotePolicies(JSON.stringify(policies))).toEqual(policies);
  });

  it.each([
    [true, 0, null],
    [true, 1, 1],
    [true, 19, 1],
    [true, 20, 2],
    [true, 40, 2],
    [false, 0, null],
    [false, 20, 1],
    [false, 40, 1],
    [null, 19, 1],
    [null, 20, 2],
  ] as const)(
    "selects tournament=%s with %i players: %s votes",
    (tournament, count, expected) => {
      expect(selectAdminVotesRequired(policies, tournament, count)).toBe(
        expected,
      );
      expect(
        selectAdminVotesRequired([...policies].reverse(), tournament, count),
      ).toBe(expected);
    },
  );

  it("uses the highest eligible minimum, not the largest vote count", () => {
    expect(
      selectAdminVotesRequired(
        [
          { tournament: true, minPlayerCount: 0, adminVotes: 3 },
          { tournament: true, minPlayerCount: 20, adminVotes: 2 },
        ],
        true,
        20,
      ),
    ).toBe(2);
  });

  it("disables controls for unmatched modes and player counts, including an unresolved mode", () => {
    const sparse = [{ tournament: true, minPlayerCount: 20, adminVotes: 2 }];
    expect(selectAdminVotesRequired(sparse, false, 40)).toBeNull();
    expect(selectAdminVotesRequired(sparse, true, 19)).toBeNull();
    expect(selectAdminVotesRequired(sparse, null, 40)).toBeNull();
  });

  it.each(["not json", "null", "2", "{}", "[null]", "[[]]", "[{}]"])(
    "rejects malformed policy config %s",
    (value) => {
      expect(() => loadAdminVotePolicies(value)).toThrow(
        "RELAY_ADMIN_VOTE_POLICIES",
      );
    },
  );

  it.each([
    { tournament: "true" },
    { tournament: null },
    { minPlayerCount: -1 },
    { minPlayerCount: 1.5 },
    { minPlayerCount: "20" },
    { adminVotes: 0 },
    { adminVotes: -1 },
    { adminVotes: 1.5 },
    { adminVotes: "2" },
    { adminVotes: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid policy fields %j", (fields) => {
    expect(() =>
      loadAdminVotePolicies(JSON.stringify([{ ...policies[0], ...fields }])),
    ).toThrow("RELAY_ADMIN_VOTE_POLICIES[0]");
  });

  it("rejects ambiguous duplicate mode/minimum pairs", () => {
    expect(() =>
      loadAdminVotePolicies(
        JSON.stringify([policies[0], { ...policies[0], adminVotes: 3 }]),
      ),
    ).toThrow("repeats tournament=true, minPlayerCount=20");
  });
});

describe("mission control votes", () => {
  it.each(["recording", "watching"] as const)(
    "keeps %s disabled after two disable votes and one dissenting admin, in any order",
    (setting) => {
      const permutations = [
        [1, 2, 3],
        [1, 3, 2],
        [2, 1, 3],
        [2, 3, 1],
        [3, 1, 2],
        [3, 2, 1],
      ];
      for (const order of permutations) {
        const controls = new MissionControls();
        for (const admin of order)
          controls.vote(setting, admin === 3, `guid:${admin}`, 2);
        expect(controls[setting], `admin order ${order}`).toBe(false);
        // Only a dissenting vote after the change starts a reversal ballot.
        expect(controls.voteCount(setting)).toBe(order.at(-1) === 3 ? 1 : 0);
      }
    },
  );

  it.each(["recording", "watching"] as const)(
    "requires fresh distinct votes through repeated %s reversals and withdrawals",
    (setting) => {
      const controls = new MissionControls();
      for (let round = 0; round < 100; round++) {
        const before = controls[setting];
        for (let repeat = 0; repeat < 10; repeat++)
          controls.vote(setting, !before, "guid:1", 2);
        expect(controls[setting]).toBe(before);
        controls.vote(setting, before, "guid:1", 2);
        controls.vote(setting, !before, "guid:2", 2);
        expect(controls[setting]).toBe(before);
        controls.vote(setting, !before, "guid:3", 2);
        expect(controls[setting]).toBe(!before);
        expect(controls.voteCount(setting)).toBe(0);
      }
    },
  );

  it("counts each admin once and requires fresh agreement to reverse either setting", () => {
    const controls = new MissionControls();
    for (const setting of ["recording", "watching"] as const) {
      controls.vote(setting, false, "guid:1", 2);
      controls.vote(setting, false, "guid:1", 2);
      expect(controls[setting]).toBe(true);
      expect(controls.voteCount(setting)).toBe(1);
      controls.vote(setting, false, "guid:2", 2);
      expect(controls[setting]).toBe(false);
      expect(controls.voteCount(setting)).toBe(0);
      controls.vote(setting, true, "guid:1", 2);
      expect(controls[setting]).toBe(false);
      controls.vote(setting, true, "guid:2", 2);
      expect(controls[setting]).toBe(true);
    }
  });

  it("withdraws a pending vote when the same admin requests the current setting", () => {
    const controls = new MissionControls();
    controls.vote("recording", false, "guid:1", 2);
    controls.vote("watching", false, "guid:1", 2);
    controls.vote("recording", true, "guid:1", 2);
    expect(controls.voteCount("recording")).toBe(0);
    expect(controls.voteCount("watching")).toBe(1);
    controls.retainVoters(new Set(["guid:2"]));
    expect(controls.needsPersistence).toBe(false);
  });

  it("persists independent pending votes and resets them at the right boundaries", () => {
    const controls = new MissionControls();
    controls.observeMission("1", "Katabatic");
    controls.vote("recording", false, "guid:1", 2);
    controls.vote("watching", false, "guid:2", 2);
    expect(controls.needsPersistence).toBe(true);
    const restored = MissionControls.restore(
      JSON.parse(JSON.stringify(controls.snapshot())),
    )!;
    expect(restored.snapshot()).toEqual(controls.snapshot());
    restored.finishRecording();
    expect(restored.voteCount("recording")).toBe(0);
    expect(restored.voteCount("watching")).toBe(1);
    restored.vote("recording", false, "guid:2", 1);
    expect(restored.recording).toBe(true);
    restored.observeMission("2", "Katabatic");
    expect(restored.voteCount("watching")).toBe(0);
    expect(restored.needsPersistence).toBe(false);
  });

  it("does not reinterpret pending votes when a newer demo journal restores a different policy", () => {
    const controls = new MissionControls();
    controls.vote("recording", false, "guid:1", 2);
    controls.vote("watching", false, "guid:1", 2);
    controls.restoreRecordingPolicy(true);
    expect(controls.voteCount("recording")).toBe(1);
    controls.restoreRecordingPolicy(false);
    controls.vote("recording", true, "guid:2", 2);
    expect(controls.recording).toBe(false);
    expect(controls.voteCount("recording")).toBe(1);
    controls.restoreRecordingPolicy(false, false);
    expect(controls.voteCount("recording")).toBe(0);
    expect(controls.voteCount("watching")).toBe(1);
  });

  it.each([
    null,
    [],
    { recording: "guid:1" },
    { watching: [42] },
    { recording: ["guid:0"] },
  ])("rejects invalid saved votes %j", (votes) => {
    expect(
      MissionControls.restore({
        mission: null,
        recording: true,
        watching: true,
        votes,
      }),
    ).toBeNull();
  });
});

describe("MapGenius commands", () => {
  it.each(["rec", "record", "recording", "demo"])(
    "supports +/- %s",
    (alias) => {
      expect(parseMissionControlCommand(`@MapGenius +${alias}`)).toEqual({
        recording: true,
      });
      expect(
        parseMissionControlCommand(`@MAPGENIUS:-${alias.toUpperCase()}`),
      ).toEqual({ recording: false });
    },
  );

  it.each(["watch", "spectate", "spectator", "spectators"])(
    "supports +/- %s",
    (alias) => {
      expect(parseMissionControlCommand(`@MapGenius: +${alias}`)).toEqual({
        watching: true,
      });
      expect(parseMissionControlCommand(`@mapgenius -${alias}`)).toEqual({
        watching: false,
      });
    },
  );

  it("combines independent settings, with the last modifier winning", () => {
    expect(
      parseMissionControlCommand(
        " @MapGenius: -rec +watch +rec -spectator status ",
      ),
    ).toEqual({ recording: true, watching: false });
  });

  it.each(["@MapGenius", "@mapgenius:", "@MapGenius status"])(
    "reports status for %s",
    (text) => {
      expect(parseMissionControlCommand(text)).toEqual({});
    },
  );

  it.each([
    "hello @MapGenius -rec",
    "@MapGeniusOther -rec",
    "@MapGenius-rec",
    "-rec",
  ])("ignores %s", (text) => {
    expect(parseMissionControlCommand(text)).toBeNull();
  });

  it("rejects an unknown modifier without applying a partial command", () => {
    const command = parseMissionControlCommand("@MapGenius -rec -wotch");
    expect(command?.error).toBeTruthy();
    expect(command?.recording).toBeUndefined();
  });

  it("decodes sender identity from the global chat client ID, not its display name", () => {
    expect(
      decodeGlobalChat([
        "7",
        "",
        "1",
        "\x05%1: %2",
        "Someone else",
        "@MapGenius -rec",
      ]),
    ).toEqual({ clientId: 7, text: "@MapGenius -rec" });
  });

  it.each([
    ["7", "", "1", "\x04%1: %2", "Admin", "@MapGenius -rec"],
    ["7", "", "1", "\x05%1: %2", "@MapGenius -rec"],
    ["7junk", "", "1", "\x05%1: %2", "Admin", "@MapGenius -rec"],
    ["0", "", "1", "\x05%1: %2", "Admin", "@MapGenius -rec"],
    ["7", "", "1", "Private message %1: %2", "Admin", "@MapGenius -rec"],
  ])("rejects non-global or malformed chat %j", (...args) => {
    expect(decodeGlobalChat(args)).toBeNull();
  });
});

describe("per-mission controls", () => {
  it("latches the final choice across relay restart and clears it on a new mission", () => {
    const controls = new MissionControls();
    controls.observeMission("1", "Katabatic");
    controls.recording = false;
    controls.finishRecording();
    const restored = MissionControls.restore(controls.snapshot())!;
    expect(restored.recordingDecision).toBe(false);
    expect(restored.needsPersistence).toBe(true);
    restored.observeMission("2", "Katabatic");
    expect(restored.recordingDecision).toBeUndefined();
    expect(restored.recording).toBe(true);
  });

  it("preserves restrictions on reconnect, resetting on a new sequence even for the same map", () => {
    const controls = new MissionControls();
    expect(controls.observeMission("1", "Katabatic")).toBe(false);
    controls.recording = controls.watching = false;
    expect(controls.observeMission("1", "Katabatic")).toBe(false);
    expect(controls.snapshot()).toMatchObject({
      recording: false,
      watching: false,
    });
    expect(controls.observeMission("2", "Katabatic")).toBe(true);
    expect(controls.restricted).toBe(false);
  });

  it("also detects a changed map after a server restart reuses a sequence", () => {
    const controls = new MissionControls();
    controls.observeMission("1", "Katabatic");
    controls.recording = false;
    expect(controls.observeMission("1", "Raindance")).toBe(true);
    expect(controls.recording).toBe(true);
  });

  it("does not reset before mission identity is known, or for incomplete phases", () => {
    const controls = new MissionControls();
    controls.watching = false;
    controls.observeMission("", "Katabatic");
    controls.observeMission("1", "");
    controls.observeMission("1", "Katabatic");
    expect(controls.watching).toBe(false);
  });

  it("round-trips restrictions across a relay restart", () => {
    const controls = new MissionControls();
    controls.observeMission("2", "Katabatic");
    controls.recording = false;
    const restored = MissionControls.restore(
      JSON.parse(JSON.stringify(controls.snapshot())),
    )!;
    expect(restored.snapshot()).toEqual(controls.snapshot());
    expect(restored.observeMission("2", "Katabatic")).toBe(false);
    expect(restored.recording).toBe(false);
    expect(restored.observeMission("3", "Katabatic")).toBe(true);
    expect(restored.recording).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { recording: "false", watching: true, mission: null },
    { recording: false, watching: true, mission: ["1"] },
  ])("rejects malformed saved controls %j", (value) => {
    expect(MissionControls.restore(value)).toBeNull();
  });
});
