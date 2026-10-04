import { describe, expect, it } from "vitest";
import {
  decodeGlobalChat,
  isAlwaysAdminPlayer,
  loadAdminVotePolicies,
  loadAlwaysAdminPlayers,
  MissionControls,
  parseMissionControlCommand,
  selectAdminVoteRequirements,
} from "./missionControls";
import { detectColorCode } from "./shared";

const oneAdminVote = { adminVotes: 1, superAdminVotes: 0 };
const twoAdminVotes = { adminVotes: 2, superAdminVotes: 0 };

describe("always-admin players", () => {
  it.each([undefined, "", "  ", "[]"])("defaults to nobody for %j", (value) => {
    expect([...loadAlwaysAdminPlayers(value)]).toEqual([]);
  });

  it("preserves exact case, spaces and commas, and deduplicates entries", () => {
    expect([
      ...loadAlwaysAdminPlayers('["Alice","alice","A, B","Alice"]'),
    ]).toEqual(["Alice", "alice", "A, B"]);
  });

  it.each([
    "Alice,Bob",
    '"Alice"',
    "{}",
    "null",
    "[null]",
    "[1]",
    '[""]',
    '["   "]',
  ])("rejects invalid configuration %s", (value) => {
    expect(() => loadAlwaysAdminPlayers(value)).toThrow("ALWAYS_ADMIN_PLAYERS");
  });

  it.each([
    ["Alice", false, true],
    ["alice", false, false],
    ["ALICE", false, false],
    ["\x10\x0b[TAG]\x08Alice\x11", false, true],
    ["\x10\x08Alice\x0b[TAG]\x11", false, true],
    ["[TAG]Alice", false, false],
    ["Alice", true, false],
    ["\x10\x0cAlice\x11", true, false],
    ["\x10\x0b[TAG]\x08Alice\x11", true, false],
    ["Alice", undefined, false],
  ] as const)("checks base name %j, smurf=%s", (rawName, isSmurf, expected) => {
    expect(isAlwaysAdminPlayer({ rawName, isSmurf }, new Set(["Alice"]))).toBe(
      expected,
    );
  });

  it("does not authorize absent players or absent configuration", () => {
    expect(isAlwaysAdminPlayer(undefined, new Set(["Alice"]))).toBe(false);
    expect(
      isAlwaysAdminPlayer({ rawName: "Alice", isSmurf: false }, undefined),
    ).toBe(false);
  });
});

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
      expect(selectAdminVoteRequirements(loaded, true, 20)).toBeNull();
      expect(selectAdminVoteRequirements(loaded, false, 20)).toBeNull();
    },
  );

  it("allows an empty array to disable admin controls everywhere", () => {
    const loaded = loadAdminVotePolicies("[]");
    expect(loaded).toEqual([]);
    for (const mode of [true, false, null])
      expect(selectAdminVoteRequirements(loaded, mode, 20)).toBeNull();
  });

  it("loads a JSON array of policies", () => {
    expect(loadAdminVotePolicies(JSON.stringify(policies))).toEqual(policies);
  });

  it.each([
    { adminVotes: 2, superAdminVotes: 1 },
    { superAdminVotes: 1 },
    { adminVotes: 0, superAdminVotes: 2 },
    { adminVotes: 2 },
    { adminVotes: 2, superAdminVotes: 0 },
  ])("loads optional role thresholds %j", (thresholds) => {
    const policy = { tournament: true, minPlayerCount: 0, ...thresholds };
    const loaded = loadAdminVotePolicies(JSON.stringify([policy]));
    expect(loaded).toEqual([policy]);
    expect(selectAdminVoteRequirements(loaded, true, 0)).toEqual({
      adminVotes: thresholds.adminVotes ?? 0,
      superAdminVotes: thresholds.superAdminVotes ?? 0,
    });
  });

  it.each([
    twoAdminVotes,
    { adminVotes: 2, superAdminVotes: 2 },
    { adminVotes: 2, superAdminVotes: 3 },
  ])(
    "preserves identical thresholds while tournament mode is unresolved: %j",
    (requirements) => {
      const matching = [true, false].map((tournament) => ({
        tournament,
        minPlayerCount: 0,
        ...requirements,
      }));
      expect(selectAdminVoteRequirements(matching, null, 0)).toEqual(
        requirements,
      );
    },
  );

  it.each([
    [
      { adminVotes: 2, superAdminVotes: 1 },
      { adminVotes: 1 },
      { adminVotes: 2, superAdminVotes: 1 },
    ],
    [
      { superAdminVotes: 1 },
      { adminVotes: 3 },
      { adminVotes: 0, superAdminVotes: 3 },
    ],
    [
      { adminVotes: 3 },
      { superAdminVotes: 1 },
      { adminVotes: 0, superAdminVotes: 3 },
    ],
    [
      { superAdminVotes: 2 },
      { superAdminVotes: 3 },
      { adminVotes: 0, superAdminVotes: 3 },
    ],
  ])(
    "keeps unresolved-mode thresholds safe for both policies: %j / %j",
    (tournament, normal, expected) => {
      expect(
        selectAdminVoteRequirements(
          [
            { tournament: true, minPlayerCount: 0, ...tournament },
            { tournament: false, minPlayerCount: 0, ...normal },
          ],
          null,
          0,
        ),
      ).toEqual(expected);
    },
  );

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
      const requirements =
        expected === null ? null : { adminVotes: expected, superAdminVotes: 0 };
      expect(selectAdminVoteRequirements(policies, tournament, count)).toEqual(
        requirements,
      );
      expect(
        selectAdminVoteRequirements([...policies].reverse(), tournament, count),
      ).toEqual(requirements);
    },
  );

  it("uses the highest eligible minimum, not the largest vote count", () => {
    expect(
      selectAdminVoteRequirements(
        [
          { tournament: true, minPlayerCount: 0, adminVotes: 3 },
          { tournament: true, minPlayerCount: 20, adminVotes: 2 },
        ],
        true,
        20,
      ),
    ).toEqual(twoAdminVotes);
  });

  it("disables controls for unmatched modes and player counts, including an unresolved mode", () => {
    const sparse = [{ tournament: true, minPlayerCount: 20, adminVotes: 2 }];
    expect(selectAdminVoteRequirements(sparse, false, 40)).toBeNull();
    expect(selectAdminVoteRequirements(sparse, true, 19)).toBeNull();
    expect(selectAdminVoteRequirements(sparse, null, 40)).toBeNull();
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
    { adminVotes: null },
    { superAdminVotes: -1 },
    { superAdminVotes: 1.5 },
    { superAdminVotes: "1" },
    { superAdminVotes: null },
    { superAdminVotes: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid policy fields %j", (fields) => {
    expect(() =>
      loadAdminVotePolicies(JSON.stringify([{ ...policies[0], ...fields }])),
    ).toThrow("RELAY_ADMIN_VOTE_POLICIES[0]");
  });

  it.each([
    {},
    { adminVotes: 0 },
    { superAdminVotes: 0 },
    { adminVotes: 0, superAdminVotes: 0 },
  ])("rejects policies with neither role enabled: %j", (thresholds) => {
    expect(() =>
      loadAdminVotePolicies(
        JSON.stringify([
          { tournament: true, minPlayerCount: 0, ...thresholds },
        ]),
      ),
    ).toThrow("at least one positive");
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
  it.each(["", "client:7", "guid:0", "guid:000", "guid:-1", "guid:invalid"])(
    "ignores votes without a valid account GUID: %j",
    (voter) => {
      const controls = new MissionControls();
      for (const setting of ["recording", "watching"] as const) {
        expect(controls.vote(setting, false, voter, oneAdminVote)).toBe(false);
        expect(controls[setting]).toBe(true);
        expect(controls.voteCount(setting)).toBe(0);
      }
    },
  );

  it("drops legacy client-ID ballots while restoring mission settings and GUID votes", () => {
    const restored = MissionControls.restore({
      mission: ["1", "Katabatic"],
      recording: false,
      watching: false,
      votes: {
        recording: ["client:7", "guid:123"],
        watching: ["client:8"],
      },
    });
    expect(restored?.snapshot()).toEqual({
      mission: ["1", "Katabatic"],
      recording: false,
      watching: false,
      votes: { recording: { "guid:123": "admin" } },
    });
  });

  it.each(["recording", "watching"] as const)(
    "allows two admins or one superadmin to change %s, clearing both tallies on reversal",
    (setting) => {
      const requirements = { adminVotes: 2, superAdminVotes: 1 };
      const controls = new MissionControls();
      controls.vote(setting, false, "guid:1", requirements);
      expect(controls[setting]).toBe(true);
      controls.vote(setting, false, "guid:2", requirements);
      expect(controls[setting]).toBe(false);
      controls.vote(setting, true, "guid:3", requirements, "superadmin");
      expect(controls[setting]).toBe(true);
      controls.vote(setting, false, "guid:1", requirements);
      controls.vote(setting, false, "guid:3", requirements, "superadmin");
      expect(controls[setting]).toBe(false);
      expect(controls.voteCount(setting)).toBe(0);
      expect(controls.voteCount(setting, "superadmin")).toBe(0);
    },
  );

  it("rejects regular ballots when only superadmins may vote", () => {
    const controls = new MissionControls();
    const requirements = { adminVotes: 0, superAdminVotes: 2 };
    expect(controls.vote("recording", false, "guid:1", requirements)).toBe(
      false,
    );
    controls.vote("recording", false, "guid:2", requirements, "superadmin");
    controls.vote("recording", false, "guid:2", requirements, "superadmin");
    expect(controls.recording).toBe(true);
    expect(controls.voteCount("recording")).toBe(1);
    controls.vote("recording", false, "guid:3", requirements, "superadmin");
    expect(controls.recording).toBe(false);
  });

  it("counts superadmins once toward the regular threshold when no shortcut applies", () => {
    const controls = new MissionControls();
    controls.vote("recording", false, "guid:1", twoAdminVotes, "superadmin");
    controls.vote("recording", false, "guid:1", twoAdminVotes, "superadmin");
    expect(controls.voteCount("recording")).toBe(1);
    expect(controls.recording).toBe(true);
    controls.vote("recording", false, "guid:2", twoAdminVotes);
    expect(controls.recording).toBe(false);
  });

  it("preserves cast-time levels through restore and duplicate votes, capturing a new level only after withdrawal", () => {
    const controls = new MissionControls();
    const requirements = { adminVotes: 5, superAdminVotes: 3 };
    controls.vote("recording", false, "guid:1", requirements);
    controls.vote("recording", false, "guid:2", requirements, "superadmin");
    const restored = MissionControls.restore(
      JSON.parse(JSON.stringify(controls.snapshot())),
    )!;
    expect(
      restored.vote("recording", false, "guid:1", requirements, "superadmin"),
    ).toBe(false);
    expect(restored.vote("recording", false, "guid:2", requirements)).toBe(
      false,
    );
    expect(restored.recording).toBe(true);
    expect(restored.voteCount("recording", "superadmin")).toBe(1);
    expect(restored.snapshot().votes).toEqual({
      recording: { "guid:1": "admin", "guid:2": "superadmin" },
    });
    restored.vote("recording", true, "guid:1", requirements, "superadmin");
    restored.vote("recording", false, "guid:1", requirements, "superadmin");
    expect(restored.voteCount("recording", "superadmin")).toBe(2);
    restored.vote("recording", true, "guid:2", requirements);
    restored.vote("recording", false, "guid:2", requirements);
    expect(restored.voteCount("recording", "superadmin")).toBe(1);
    expect(restored.snapshot().votes).toEqual({
      recording: { "guid:1": "superadmin", "guid:2": "admin" },
    });
  });

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
          controls.vote(setting, admin === 3, `guid:${admin}`, twoAdminVotes);
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
          controls.vote(setting, !before, "guid:1", twoAdminVotes);
        expect(controls[setting]).toBe(before);
        controls.vote(setting, before, "guid:1", twoAdminVotes);
        controls.vote(setting, !before, "guid:2", twoAdminVotes);
        expect(controls[setting]).toBe(before);
        controls.vote(setting, !before, "guid:3", twoAdminVotes);
        expect(controls[setting]).toBe(!before);
        expect(controls.voteCount(setting)).toBe(0);
      }
    },
  );

  it("counts each admin once and requires fresh agreement to reverse either setting", () => {
    const controls = new MissionControls();
    for (const setting of ["recording", "watching"] as const) {
      controls.vote(setting, false, "guid:1", twoAdminVotes);
      controls.vote(setting, false, "guid:1", twoAdminVotes);
      expect(controls[setting]).toBe(true);
      expect(controls.voteCount(setting)).toBe(1);
      controls.vote(setting, false, "guid:2", twoAdminVotes);
      expect(controls[setting]).toBe(false);
      expect(controls.voteCount(setting)).toBe(0);
      controls.vote(setting, true, "guid:1", twoAdminVotes);
      expect(controls[setting]).toBe(false);
      controls.vote(setting, true, "guid:2", twoAdminVotes);
      expect(controls[setting]).toBe(true);
    }
  });

  it("withdraws a pending vote when the same admin requests the current setting", () => {
    const controls = new MissionControls();
    controls.vote("recording", false, "guid:1", twoAdminVotes);
    controls.vote("watching", false, "guid:1", twoAdminVotes);
    controls.vote("recording", true, "guid:1", twoAdminVotes);
    expect(controls.voteCount("recording")).toBe(0);
    expect(controls.voteCount("watching")).toBe(1);
    controls.vote("watching", true, "guid:1", twoAdminVotes);
    expect(controls.needsPersistence).toBe(false);
  });

  it("persists independent pending votes and resets them at the right boundaries", () => {
    const controls = new MissionControls();
    controls.observeMission("1", "Katabatic");
    controls.vote("recording", false, "guid:1", twoAdminVotes);
    controls.vote("watching", false, "guid:2", twoAdminVotes);
    expect(controls.needsPersistence).toBe(true);
    const restored = MissionControls.restore(
      JSON.parse(JSON.stringify(controls.snapshot())),
    )!;
    expect(restored.snapshot()).toEqual(controls.snapshot());
    restored.finishRecording();
    expect(restored.voteCount("recording")).toBe(0);
    expect(restored.voteCount("watching")).toBe(1);
    restored.vote("recording", false, "guid:2", oneAdminVote);
    expect(restored.recording).toBe(true);
    restored.observeMission("2", "Katabatic");
    expect(restored.voteCount("watching")).toBe(0);
    expect(restored.needsPersistence).toBe(false);
  });

  it("does not reinterpret pending votes when a newer demo journal restores a different policy", () => {
    const controls = new MissionControls();
    controls.vote("recording", false, "guid:1", twoAdminVotes);
    controls.vote("watching", false, "guid:1", twoAdminVotes);
    controls.restoreRecordingPolicy(true);
    expect(controls.voteCount("recording")).toBe(1);
    controls.restoreRecordingPolicy(false);
    controls.vote("recording", true, "guid:2", twoAdminVotes);
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
    { recording: { "guid:1": "captain" } },
    { recording: { "client:7": "admin" } },
    { recording: { "guid:0": "superadmin" } },
    { watching: { "guid:2": true } },
    { watching: { "guid:2": null } },
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
    const args = [
      "7",
      "",
      "1",
      "\x06%1: %2",
      "Someone else",
      "@MapGenius -rec",
    ];
    expect(detectColorCode(args[3])).toBe(4);
    expect(decodeGlobalChat(args)).toEqual({
      clientId: 7,
      text: "@MapGenius -rec",
    });
  });

  it.each([
    ["7", "", "1", "\x05%1: %2", "Admin", "@MapGenius -rec"],
    ["7", "", "1", "\x04%1: %2", "Admin", "@MapGenius -rec"],
    ["7", "", "1", "\x06%1: %2", "@MapGenius -rec"],
    ["7junk", "", "1", "\x06%1: %2", "Admin", "@MapGenius -rec"],
    ["0", "", "1", "\x06%1: %2", "Admin", "@MapGenius -rec"],
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
