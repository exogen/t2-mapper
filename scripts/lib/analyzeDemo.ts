import { setImmediate } from "node:timers/promises";
import {
  BlockTypeMove,
  BlockTypePacket,
  DemoParser,
  type RemoteCommandEventData,
} from "t2-demo-parser";
import type { DemoGame, DemoMetadata } from "../../relay/demoRecorder.js";
import { DemoPlayers } from "../../relay/demoPlayers.js";
import { WatchStateAccumulator } from "../../relay/watchState.js";
import {
  extractMissionInfo,
  parseDemoValues,
} from "../../src/stream/demoStreaming";
import { parseDemoHeaderDate } from "../../src/stream/demoDate";

/**
 * Fallback for demos with unparseable $DemoValue dates: the filename's
 * `_YYYYMMDDTHHMM_` stamp (also UTC, also minute precision).
 */
function parseFilenameDate(filename: string): string | null {
  const m = /_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})_/.exec(filename);
  if (!m) return null;
  const date = new Date(
    Date.UTC(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The PJ tail rows of the $DemoValue array, via the app's own extractor
 * (one reader for the layout the relay writes); the date is converted
 * to ISO here.
 */
function parseDemoHeader(demoValues: string[]) {
  const info = extractMissionInfo(demoValues);
  return {
    recorder: info.recorderName ?? "",
    recorderClientId: info.recorderClientId,
    server: info.serverDisplayName ?? "",
    address: info.serverAddress ?? "",
    recordedAt: info.recordingDate
      ? parseDemoHeaderDate(info.recordingDate)
      : null,
    mission: info.missionDisplayName ?? "",
    mod: info.mod ?? "",
    gameType: info.missionType ?? "",
  };
}

/**
 * Reproduce what the live recorder's sidecar would have contained, by
 * replaying the demo's packets through the relay's own accumulator and
 * counting unique tag-less names, with full aliases kept for search. Initial roster
 * entries also count for demos recorded after joining a server.
 */
export async function analyzeDemo(
  bytes: Uint8Array,
  filename: string,
): Promise<DemoMetadata> {
  const parser = new DemoParser(bytes);
  const { header, initialBlock } = await parser.load();
  const info = parseDemoHeader(initialBlock.demoValues);

  const initialRoster = parseDemoValues(initialBlock.demoValues).playerRoster;
  const watchState = new WatchStateAccumulator(initialRoster);
  // Relay headers use 0 as an unknown client ID. Retail mid-match demos
  // have already missed the welcome join, so later joins cannot identify self.
  const recorderClientId =
    info.recorderClientId != null && info.recorderClientId > 0
      ? info.recorderClientId
      : null;
  watchState.selfClientId = recorderClientId;
  const fromConnect =
    initialBlock.dataBlocks.size === 0 && initialRoster.size === 0;
  for (const [id, value] of initialBlock.taggedStrings) {
    watchState.netStrings.set(id, value);
  }

  const players = new DemoPlayers(info.recorder);
  const samplePlayers = () =>
    players.sample(
      watchState.getPlayerRoster(),
      recorderClientId ?? (fromConnect ? watchState.selfClientId : null),
    );
  samplePlayers();
  const games: DemoGame[] = [];
  // The mission in progress but not yet confirmed started; promoted to
  // `games` the moment the match starts (MsgMissionStart or a running
  // clock), so warmup-only missions never produce an entry.
  // || (not ??): the parser initializes missionName to "" and only
  // fills it when the initial block's phase-2 parse succeeds.
  const firstMission = initialBlock.missionName || info.mission;
  let pending: { mission: string; startMs: number } | null = firstMission
    ? { mission: firstMission, startMs: 0 }
    : null;
  // The most recent promoted game, patchable while its mission is still
  // current (its MsgLoadInfo type may arrive after the match starts).
  let lastGame: DemoGame | null = null;
  let currentMission = pending?.mission ?? null;
  // A from-connect recording (relay: empty initial datablock table, the
  // stream carries them) replays MissionStartPhase1 for the mission the
  // initial block already seeded — ignore that one repeat only, so a
  // later back-to-back rematch on the same map still opens a new game.
  // A retail mid-match demo's first Phase1 is always a new match.
  let awaitingSeedPhase1 =
    pending !== null && initialBlock.dataBlocks.size === 0;
  let moveTicks = 0;
  const MOVE_TICK_MS = 32;

  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    if (block.index % 1024 === 0) await setImmediate();
    if (block.type === BlockTypeMove) {
      moveTicks++;
      continue;
    }
    if (block.type !== BlockTypePacket) continue;
    if (block.parseError)
      throw new Error(`Block ${block.index}: ${block.parseError}`);
    const parsed = block.parsed;
    if (!parsed || !("events" in parsed))
      throw new Error(`Missing packet data at block ${block.index}`);
    if (parsed.parseFault)
      throw new Error(
        `Block ${block.index}: ${parsed.parseFault.stage}: ${parsed.parseFault.message}`,
      );
    watchState.applyPacket(parsed, samplePlayers);

    // Mission boundary (mirrors the live session's Phase1 handling):
    // reset mission-scoped state and open a new pending game.
    for (const evt of parsed.events) {
      if (evt.parsedData?.type !== "RemoteCommandEvent") continue;
      const cmd = evt.parsedData as RemoteCommandEventData;
      if (
        watchState.resolveNetString(cmd.funcName ?? "") !== "MissionStartPhase1"
      ) {
        continue;
      }
      const mission = watchState.resolveNetString(cmd.args?.[1] ?? "");
      if (!mission) continue;
      if (awaitingSeedPhase1 && mission === currentMission) {
        awaitingSeedPhase1 = false;
        continue;
      }
      awaitingSeedPhase1 = false;
      watchState.beginMissionChange();
      currentMission = mission;
      pending = { mission, startMs: moveTicks * MOVE_TICK_MS };
      lastGame = null;
    }

    if (pending && watchState.matchStarted) {
      lastGame = {
        mission: pending.mission,
        gameType: watchState.missionType ?? "",
        startMs: pending.startMs,
        tournament: watchState.tournamentMode ?? false,
      };
      games.push(lastGame);
      pending = null;
    }
    if (lastGame && !lastGame.gameType && watchState.missionType) {
      lastGame.gameType = watchState.missionType;
    }
    if (lastGame && !lastGame.tournament && watchState.tournamentMode) {
      lastGame.tournament = true;
    }

    samplePlayers();
  }

  return {
    filename,
    bytes: bytes.length,
    recordedAt:
      info.recordedAt ??
      parseFilenameDate(filename) ??
      new Date(0).toISOString(),
    // The stream is authoritative: the server names itself via
    // MsgMissionDropInfo/MsgLoadInfo during the recording, overriding
    // whatever the recorder baked into $DemoValues at flush time.
    server: watchState.serverName ?? info.server,
    address: info.address,
    games,
    mod: info.mod,
    recorder: info.recorder,
    durationMs: header.demoLengthMs,
    // The recorder's original keep-trigger (patrol/watchers) isn't in the
    // .rec; describe what the replay reconstructed instead.
    reason: `backfilled: ${players.count} players, ${games.length} game${games.length === 1 ? "" : "s"}`,
    ...players.metadata(),
  };
}
