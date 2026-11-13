/** Chronological per-mission score collection, independent of world/loadout sampling. */
import type { StreamSnapshot } from "../src/stream/types";
import {
  hasGameOverAnnouncement,
  isRealMatchStart,
} from "../src/stream/matchEvents";
import { isClassicModInfoMessage } from "./serverMessageDecode";
import {
  applyServerMessageState,
  type ServerMessageRosterEntry,
} from "./serverMessageState";
import {
  normalizePlayerGuid,
  parseScoreHudLine,
  stripTaggedStringMarkup,
} from "./shared";
import type { PlayerMapScore } from "./demoPlayerStatsModel";

type ScoreSource = "initial" | "live" | "hud" | "debrief";

interface ScoreMission {
  mission: string | null;
  fromSec: number;
  started: boolean;
  ready: boolean;
  ended: boolean;
  countdown: boolean;
  loading: boolean;
  kickoffSec: number | null;
  /** Last score per connection; simultaneous connections sharing a GUID do
   * not let a spectator's score overwrite a playing connection's result. */
  scores: Map<
    string,
    { guid: string; score: number; at: number; source: ScoreSource }
  >;
}

export interface InitialMapScoreState {
  mission?: string | null;
  /** Only scores explicitly present in the recording's saved PLAYERLIST. */
  roster?: ReadonlyMap<number, ServerMessageRosterEntry>;
}

/** Torque message tags are case-insensitive; mods also use msgMissionStart. */
const SCORE_MESSAGE_TYPES = new Map(
  [
    "MsgLoadInfo",
    "MsgClientReady",
    "MsgMissionStart",
    "MsgGameOver",
    "MsgSystemClock",
    "MsgPlayerScore",
    "SetLineHud",
    "MsgDebriefAddLine",
    "MsgClientJoin",
    "MsgClientDrop",
    "MsgClientJoinTeam",
    "MsgClientNameChanged",
    "MsgTeamScore",
    "MsgTeamScoreIs",
    "MsgCTFAddTeam",
  ].map((type) => [type.toLowerCase(), type]),
);

/** Score packets are exact, independently of the fixed-rate world samples.
 * Keep the shared protocol decoders: final debrief rows can arrive after
 * MissionEnd, and score + disconnect can land between two samples. */
export class DemoMapScoreTracker {
  private readonly state = {
    playerRoster: new Map<number, ServerMessageRosterEntry>(),
    teamScores: [],
    flags: new Map(),
    playerIdentity: {
      scope: "demo-stats",
      generations: new Map<number, number>(),
    },
  };
  private readonly observed = new Map<
    string,
    {
      score: number;
      source: ScoreSource;
      at: number;
    }
  >();
  private readonly completed = new Map<string, PlayerMapScore[]>();
  private current: ScoreMission;
  private pendingMission: string | null = null;
  private pendingScores: ScoreMission["scores"] | null = null;
  private lastEventId = -1;
  private scoreSequence = 0;

  constructor(initial: InitialMapScoreState) {
    this.current = this.mission(initial.mission ?? null, 0);
    for (const [id, entry] of initial.roster ?? []) {
      this.state.playerRoster.set(id, { ...entry });
      this.state.playerIdentity.generations.set(
        id,
        entry.clientGeneration ?? 0,
      );
      this.observed.set(this.clientKey(id, entry), {
        score: entry.score,
        source: "initial",
        at: ++this.scoreSequence,
      });
    }
  }

  step(snapshot: StreamSnapshot): void {
    // Snapshot entries establish identity for synthetic/legacy recordings;
    // their default score=0 alone is not an observed score packet.
    for (const entry of snapshot.playerRoster)
      if (!this.state.playerRoster.has(entry.clientId)) {
        this.state.playerRoster.set(entry.clientId, { ...entry, score: 0 });
        this.state.playerIdentity.generations.set(
          entry.clientId,
          entry.clientGeneration ?? 0,
        );
      }
    for (const event of snapshot.serverEvents) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      const type =
        SCORE_MESSAGE_TYPES.get(event.msgType.toLowerCase()) ?? event.msgType;
      const args =
        type === event.args[0] ? event.args : [type, ...event.args.slice(1)];
      if (
        snapshot.matchEndedAtSec != null &&
        snapshot.matchEndedAtSec >= this.current.fromSec &&
        snapshot.matchEndedAtSec <= event.timeSec
      )
        this.current.ended = true;
      if (
        type === "MsgLoadInfo" &&
        args.length >= 5 &&
        !isClassicModInfoMessage(args)
      ) {
        this.pendingScores = new Map(this.current.scores);
        this.pendingMission = args[2]?.trim() || this.pendingMission;
        this.current.mission ??= this.pendingMission;
        // Score resets for the incoming mission can precede ClientReady.
        // Keep the preceding game's final score through that loading burst.
        if (this.current.ended || this.pendingMission !== this.current.mission)
          this.current.loading = true;
      } else if (type === "MsgClientReady") {
        if (this.current.ready || this.current.started || this.current.ended) {
          if (this.pendingScores) this.current.scores = this.pendingScores;
          this.nextMission(event.timeSec);
        }
        this.current.mission = this.pendingMission ?? this.current.mission;
        this.pendingMission = null;
        this.current.ready = true;
        this.current.loading = false;
        this.pendingScores = null;
      } else if (type === "MsgMissionStart") {
        if (
          this.pendingMission ||
          this.current.ended ||
          (this.current.kickoffSec != null &&
            this.current.kickoffSec !== event.timeSec)
        )
          this.nextMission(event.timeSec);
        if (isRealMatchStart(args[1] ?? "")) {
          // Warmup scores, including penalties, belong to no played match.
          this.current.scores.clear();
          this.observed.clear();
          for (const entry of this.state.playerRoster.values()) entry.score = 0;
          this.current.started = true;
          this.current.kickoffSec = event.timeSec;
        } else {
          this.current.countdown = true;
          if (this.current.kickoffSec == null) this.current.started = false;
        }
      } else if (type === "MsgGameOver" && hasGameOverAnnouncement(args[1])) {
        this.current.ended = true;
      }
      const changes = applyServerMessageState(
        type,
        args,
        (value) => value,
        this.state,
      );
      if (changes?.matchStarted && !this.current.countdown)
        this.current.started = true;
      if (type === "MsgSystemClock" && parseFloat(args[3]) > 60_000)
        this.current.started = true;
      if (changes?.rosterChanged) this.observeScore(type, args);
      this.captureScores();
    }
    // This snapshot describes the last mission after every event above, not
    // an earlier warmup whose packets happened in the same sampling window.
    if (
      !this.current.countdown &&
      (snapshot.matchStarted ||
        (snapshot.matchClockMs != null && snapshot.matchClockMs < -60_000) ||
        snapshot.teamScores?.some((team) => team.score > 0))
    )
      this.current.started = true;
    if (
      snapshot.matchEnded &&
      (snapshot.matchEndedAtSec ?? snapshot.timeSec) >= this.current.fromSec
    )
      this.current.ended = true;
    this.captureScores();
  }

  finish(): Map<string, PlayerMapScore[]> {
    const scores = new Map(
      [...this.completed].map(([guid, entries]) => [guid, [...entries]]),
    );
    this.appendCurrent(scores);
    return scores;
  }

  private mission(mission: string | null, fromSec: number): ScoreMission {
    return {
      mission,
      fromSec,
      started: false,
      ready: false,
      ended: false,
      countdown: false,
      loading: false,
      kickoffSec: null,
      scores: new Map(),
    };
  }

  private nextMission(timeSec: number): void {
    this.appendCurrent(this.completed);
    this.current = this.mission(
      this.pendingMission ?? this.current.mission,
      timeSec,
    );
    this.pendingMission = null;
    this.pendingScores = null;
    this.observed.clear();
    for (const entry of this.state.playerRoster.values()) entry.score = 0;
  }

  private appendCurrent(result: Map<string, PlayerMapScore[]>): void {
    if (!this.current.started || !this.current.mission) return;
    const active = new Set(
      [...this.state.playerRoster].flatMap(([id, entry]) =>
        entry.teamId > 0 || entry.score !== 0
          ? [this.clientKey(id, entry)]
          : [],
      ),
    );
    const final = new Map<
      string,
      { score: number; at: number; priority: number }
    >();
    for (const [key, { guid, score, at, source }] of this.current.scores) {
      // A reconnect during the debrief cannot replace the completed match's
      // official result with the new connection's reset live score.
      const priority =
        this.current.ended && source === "debrief"
          ? 2
          : active.has(key)
            ? 1
            : 0;
      const candidate = { score, at, priority };
      const other = final.get(guid);
      if (
        !other ||
        priority > other.priority ||
        (priority === other.priority &&
          (priority === 1 ? score > other.score : at > other.at))
      )
        final.set(guid, candidate);
    }
    for (const [guid, { score }] of final) {
      let entries = result.get(guid);
      if (!entries) result.set(guid, (entries = []));
      entries.push({ mission: this.current.mission, score });
    }
  }

  private clientKey(id: number, entry: ServerMessageRosterEntry): string {
    return `${id}:${entry.clientGeneration ?? 0}`;
  }

  private observeScore(type: string, args: string[]): void {
    if (type === "MsgPlayerScore" && Number.isFinite(parseInt(args[3], 10))) {
      const id = parseInt(args[2], 10);
      const entry = this.state.playerRoster.get(id);
      if (entry) this.observe(id, entry, "live", parseInt(args[3], 10));
    } else if (type === "SetLineHud") {
      for (const { name } of parseScoreHudLine(args.slice(5)))
        for (const [id, entry] of this.state.playerRoster)
          if (entry.teamId > 0 && entry.name === name) {
            this.observe(id, entry, "hud", entry.score);
            break;
          }
    } else if (type === "MsgDebriefAddLine") {
      const name = stripTaggedStringMarkup(args[3] ?? "").trim();
      for (const [id, entry] of this.state.playerRoster)
        if (entry.name === name) {
          this.observe(id, entry, "debrief", entry.score);
          break;
        }
    }
  }

  private observe(
    id: number,
    entry: ServerMessageRosterEntry,
    source: "live" | "hud" | "debrief",
    score: number,
  ): void {
    const key = this.clientKey(id, entry);
    const before = this.observed.get(key);
    // Debrief is the final result, while TacoServer's ordinary live channel
    // can keep sending placeholder zeros after a real score-HUD update.
    if (before?.source === "debrief" && source !== "debrief") return;
    if (source === "live" && score === 0 && before?.source === "hud") return;
    this.observed.set(key, { source, score, at: ++this.scoreSequence });
  }

  private captureScores(): void {
    if (this.current.loading) return;
    for (const [id, entry] of this.state.playerRoster) {
      const key = this.clientKey(id, entry);
      const guid = normalizePlayerGuid(entry.guid);
      const observed = this.observed.get(key);
      if (guid && observed && Number.isFinite(observed.score))
        this.current.scores.set(key, {
          guid,
          score: observed.score,
          at: observed.at,
          source: observed.source,
        });
    }
  }
}
