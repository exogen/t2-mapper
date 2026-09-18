import { createDemoStreamingRecording } from "../stream/demoStreaming";
import { isRealMatchStart } from "../stream/matchEvents";
import type { PlayerRosterEntry, StreamEntity } from "../stream/types";
import { taglessPlayerName, STREAM_TICK_SEC } from "../stream/streamHelpers";
import type { MatchStats, StatsData, StatsPlayer } from "./types";

/** Eight simulation ticks (~4 Hz): density measures time, including standing still. */
export const HEATMAP_SAMPLE_INTERVAL_SEC = 8 * STREAM_TICK_SEC;
const YIELD_SLICE_MS = 16;

/** Scan independently of the viewer's playback position, without seek history. */
export async function scanDemoStats(
  buffer: ArrayBuffer,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<StatsData> {
  signal?.throwIfAborted();
  const recording = await createDemoStreamingRecording(buffer, {
    checkpoints: false,
    groundEffects: false,
    allowPartial: true,
  });
  signal?.throwIfAborted();
  const playback = recording.streamingPlayback;
  const duration = recording.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("This demo has no recorded match time.");
  }

  const matches: MatchStats[] = [];
  let current = createMatch(0, recording.missionName);
  const nextMatch = (fromSec: number, missionName = current.missionName) => {
    matches.push(finishMatch(current, matches.length, fromSec));
    current = createMatch(fromSec, missionName);
  };
  const endMatch = (timeSec: number) => {
    if (
      timeSec >= (current.matchStartSec ?? current.fromSec) &&
      current.sceneFromSec != null &&
      (current.matchStartSec != null || current.hasScene)
    ) {
      current.matchEndSec ??= timeSec;
    }
  };
  let lastEventId = -1;
  let lastTimeSec = 0;
  let sliceStart = performance.now();

  for (let step = 0; ; step++) {
    signal?.throwIfAborted();
    const timeSec = Math.min(step * HEATMAP_SAMPLE_INTERVAL_SEC, duration);
    const snapshot = playback.stepToTime(timeSec);
    lastTimeSec = snapshot.timeSec;
    for (const event of snapshot.serverEvents) {
      if (event.id <= lastEventId) continue;
      lastEventId = event.id;
      const type = event.msgType.toLowerCase();
      if (type === "msgloadinfo") {
        // Every load is a new game, even on the same mission. Initial
        // connect/loading messages still belong to the interval from 0.
        if (
          current.ready ||
          current.hasScene ||
          current.matchStartSec != null
        ) {
          nextMatch(event.timeSec, null);
        }
        current.sceneFromSec = null;
        current.missionName =
          event.args[3]?.trim() || event.args[2]?.trim() || current.missionName;
      } else if (type === "msgmissiondropinfo") {
        current.missionName = event.args[2]?.trim() || current.missionName;
      } else if (type === "msgclientready") {
        // Also handles recordings/mods without MsgLoadInfo.
        if (current.ready || current.matchStartSec != null)
          nextMatch(event.timeSec);
        current.ready = true;
        current.sceneFromSec = event.timeSec;
      } else if (type === "msgmissionstart") {
        const kickoff = isRealMatchStart(event.args[1] ?? "");
        if (kickoff) {
          if (
            current.matchStartSec != null &&
            current.matchStartSec !== event.timeSec
          ) {
            nextMatch(current.matchEndSec ?? event.timeSec);
          } else if (current.matchEndSec != null) {
            nextMatch(current.matchEndSec);
          }
          if (current.matchStartSec == null) clearSamples(current);
          current.matchStartSec = event.timeSec;
          current.sceneFromSec ??= event.timeSec;
        } else if (current.matchEndSec != null) {
          // Same-map restarts may send only a countdown/kickoff. The gap
          // after the preceding end then belongs to the upcoming game.
          nextMatch(current.matchEndSec);
        }
        if (!kickoff) current.sawCountdown = true;
      } else if (
        type === "msggameover" ||
        type === "msgcleardebrief" ||
        type === "msgdebriefresult"
      ) {
        if (type === "msggameover" && current.hasScene)
          current.runningEvidence = true;
        endMatch(event.timeSec);
      }
    }
    // MissionEnd can arrive without a ServerMessage. Ignore the previous
    // game's frozen end state while the following mission is loading.
    const endedInCurrent =
      snapshot.matchEnded &&
      (snapshot.matchEndedAtSec ?? snapshot.timeSec) >=
        (current.matchStartSec ?? current.fromSec);
    if (endedInCurrent) {
      endMatch(snapshot.matchEndedAtSec ?? snapshot.timeSec);
    }
    if (snapshot.exhausted) break;
    // The engine can retain the old scene and scoreboard until ClientReady.
    // Neither is evidence of play (or positions) in the next game.
    const canSample =
      current.sceneFromSec != null &&
      current.matchEndSec == null &&
      !snapshot.matchEnded;
    if (
      canSample &&
      snapshot.entities.some(
        (entity) => entity.type === "Player" || entity.type === "Terrain",
      )
    ) {
      current.hasScene = true;
      // A demo may begin after kickoff (including in the final minute).
      // Keep tentative samples until a real kickoff can rule out warmup.
      // matchStarted alone is insufficient: countdowns also set that flag.
      if (
        (snapshot.matchClockMs != null && snapshot.matchClockMs < 0) ||
        snapshot.teamScores?.some((entry) => entry.score > 0)
      ) {
        current.runningEvidence = true;
      }
    }

    if (canSample) {
      const { players, x, z, t, team, playerId } = current;
      const byId = new Map(
        snapshot.entities.map((entity) => [entity.id, entity]),
      );
      const rosterByTarget = new Map(
        snapshot.playerRoster
          .filter((entry) => entry.targetId != null)
          .map((entry) => [entry.targetId!, entry]),
      );
      // Some mods omit the target ID in MsgClientJoin. An exact, unique
      // current roster name can still supply its clan-tag markup.
      const rosterByName = new Map<string, PlayerRosterEntry | null>();
      for (const entry of snapshot.playerRoster) {
        rosterByName.set(
          entry.name,
          rosterByName.has(entry.name) ? null : entry,
        );
      }
      const sampled = new Set<number>();
      for (const entity of snapshot.entities) {
        if (
          entity.type !== "Player" ||
          (entity.damageState ?? 0) !== 0 ||
          (entity.health != null && entity.health <= 0) ||
          entity.targetId == null ||
          entity.targetId < 0
        )
          continue;
        const pos = positionOf(entity, byId);
        if (!pos || !pos.every(Number.isFinite)) continue;
        let roster = rosterByTarget.get(entity.targetId);
        if (!roster && entity.playerName) {
          const named = rosterByName.get(entity.playerName);
          if (named && named.targetId == null) roster = named;
        }
        const displayName = roster?.name || entity.playerName;
        if (!displayName) continue;
        const name = taglessPlayerName(
          roster?.rawName || entity.playerRawName || displayName,
          displayName,
        );
        if (!name) continue;
        const key = name.toLowerCase();
        let player = players.get(key);
        if (!player) {
          player = {
            id: players.size,
            name,
            teamId: 0,
            sampleCount: 0,
          };
          players.set(key, player);
        }
        // Base names deliberately combine reconnects, tag changes, and
        // smurfs, regardless of account or target identity.
        player.name = name;
        player.teamId = entity.teamId ?? roster?.teamId ?? 0;
        if (sampled.has(player.id)) continue;
        sampled.add(player.id);
        player.sampleCount++;
        x.push(pos[1]);
        z.push(pos[0]);
        t.push(snapshot.timeSec - (current.matchStartSec ?? current.fromSec));
        team.push(player.teamId);
        playerId.push(player.id);
      }
    }
    if (timeSec >= duration) break;
    if (performance.now() - sliceStart >= YIELD_SLICE_MS) {
      onProgress?.(timeSec / duration);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
  }

  signal?.throwIfAborted();
  matches.push(finishMatch(current, matches.length, lastTimeSec));
  onProgress?.(1);
  return { sampleIntervalSec: HEATMAP_SAMPLE_INTERVAL_SEC, matches };
}

function createMatch(fromSec: number, missionName: string | null) {
  return {
    fromSec,
    sceneFromSec: fromSec as number | null,
    missionName,
    matchStartSec: null as number | null,
    matchEndSec: null as number | null,
    ready: false,
    hasScene: false,
    runningEvidence: false,
    sawCountdown: false,
    players: new Map<string, StatsPlayer>(),
    x: [] as number[],
    z: [] as number[],
    t: [] as number[],
    team: [] as number[],
    playerId: [] as number[],
  };
}

function finishMatch(
  current: ReturnType<typeof createMatch>,
  id: number,
  untilSec: number,
): MatchStats {
  if (
    current.matchStartSec == null &&
    (!current.runningEvidence || current.sawCountdown)
  )
    clearSamples(current);
  return {
    id,
    fromSec: current.fromSec,
    sceneFromSec: current.sceneFromSec,
    missionName: current.missionName,
    matchStartSec: current.matchStartSec,
    matchEndSec: current.matchEndSec ?? untilSec,
    matchComplete: current.matchStartSec != null && current.matchEndSec != null,
    players: [...current.players.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    positionSamples: {
      count: current.x.length,
      x: new Float32Array(current.x),
      z: new Float32Array(current.z),
      t: new Float32Array(current.t),
      team: new Uint8Array(current.team),
      playerId: new Float64Array(current.playerId),
    },
  };
}

function clearSamples(current: ReturnType<typeof createMatch>): void {
  current.players.clear();
  for (const samples of [
    current.x,
    current.z,
    current.t,
    current.team,
    current.playerId,
  ])
    samples.length = 0;
}

/** Mounted players stop receiving their own world position. */
function positionOf(
  entity: StreamEntity,
  byId: Map<string, StreamEntity>,
): StreamEntity["position"] {
  let current = entity;
  for (let hops = 0; current.mountObjectId && hops < 4; hops++) {
    const mount = byId.get(current.mountObjectId);
    if (!mount) return undefined;
    current = mount;
  }
  return current.position;
}
