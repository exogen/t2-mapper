import { setImmediate } from "node:timers/promises";
import zlib from "node:zlib";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  MaxPacketDataSize,
  type InitialBlockData,
} from "t2-demo-parser";
import type { DemoGame, DemoMetadata } from "./demoMetadata.js";
import { DemoPlayers } from "./demoPlayers.js";
import { WatchStateAccumulator } from "./watchState.js";
import { parseMissionSequence } from "./shared.js";
import {
  extractMissionInfo,
  parseDemoValues,
} from "../src/stream/demoStreaming";
import { parseDemoHeaderDate } from "../src/stream/demoDate";
import { MAX_USER_DEMO_DECOMPRESSED_BYTES } from "./userDemoTypes.js";

/** Messages are safe to return to the uploader; parser diagnostics stay private. */
export class DemoUploadValidationError extends Error {}

/**
 * Bound inflation before the parser's normal, unbounded decompression path.
 * The relay has already checked the upload's size, identifier and build.
 */
export function validateDemoUploadBytes(
  bytes: Uint8Array,
  maxExpandedBytes = MAX_USER_DEMO_DECOMPRESSED_BYTES,
): void {
  let header: ReturnType<typeof DemoParser.peekHeader>;
  try {
    header = DemoParser.peekHeader(bytes);
  } catch {
    throw new DemoUploadValidationError("The recording header is incomplete.");
  }
  const prefixEnd = header.byteLength + header.header.initialBlockSize;
  if (prefixEnd > bytes.byteLength)
    throw new DemoUploadValidationError(
      "The recording's initial state is incomplete.",
    );
  if (prefixEnd > maxExpandedBytes)
    throw new DemoUploadValidationError(
      "The decompressed recording exceeds the 128 MB limit.",
    );
  const compressed = bytes.subarray(prefixEnd);
  let inflated: Buffer;
  try {
    // The Node typings omit the documented `info: true` result shape.
    const result = zlib.inflateRawSync(compressed, {
      maxOutputLength: Math.max(1, maxExpandedBytes - prefixEnd),
      info: true,
    }) as unknown as { buffer: Buffer; engine: zlib.InflateRaw };
    if (result.engine.bytesWritten !== compressed.byteLength)
      throw new DemoUploadValidationError(
        "The recording contains trailing compressed data.",
      );
    inflated = result.buffer;
    if (prefixEnd + inflated.byteLength > maxExpandedBytes)
      throw new DemoUploadValidationError(
        "The decompressed recording exceeds the 128 MB limit.",
      );
  } catch (error) {
    if (error instanceof DemoUploadValidationError) throw error;
    throw new DemoUploadValidationError(
      error instanceof Error &&
        "code" in error &&
        error.code === "ERR_BUFFER_TOO_LARGE"
        ? "The decompressed recording exceeds the 128 MB limit."
        : "The recording's compressed data is corrupt or incomplete.",
    );
  }
  const view = new DataView(
    inflated.buffer,
    inflated.byteOffset,
    inflated.byteLength,
  );
  for (let offset = 0; offset < inflated.byteLength;) {
    if (offset + 2 > inflated.byteLength)
      throw new DemoUploadValidationError(
        "The recording ends inside a block header.",
      );
    const frame = view.getUint16(offset, true);
    const type = frame >>> 12;
    const size = frame & 0xfff;
    if (offset + 2 + size > inflated.byteLength)
      throw new DemoUploadValidationError("The recording ends inside a block.");
    if (
      (type === BlockTypePacket && (size === 0 || size > MaxPacketDataSize)) ||
      (type === BlockTypeSendPacket && size !== 0) ||
      (type === BlockTypeMove && size !== 64) ||
      (type === BlockTypeInfo && size !== 8) ||
      type > BlockTypeInfo
    )
      throw new DemoUploadValidationError(
        "The recording contains an invalid block.",
      );
    offset += 2 + size;
  }
}

async function validateUploadInitialState(
  bytes: Uint8Array,
  initial: InitialBlockData,
): Promise<void> {
  function invalid(): never {
    throw new DemoUploadValidationError(
      "The recording's initial state is corrupt or unsupported.",
    );
  }
  const trailing = initial.phase2TrailingBits;
  // Build 25034 leaves at most one spare byte plus the final bit alignment.
  if (
    initial.phase2Error ||
    initial.warnings?.length ||
    initial.initialEvents.some((event) => event.failed) ||
    trailing === undefined ||
    trailing < 0 ||
    trailing > 15
  )
    invalid();

  // The parser does not expose its initial BitStream error flag: short reads
  // can return zero without a phase2Error. A complete initial block must consume
  // the same bits with sentinel bytes appended. Decode only this small prefix,
  // with an empty DEFLATE stream, so the full recording is not inflated again.
  const { header, byteLength } = DemoParser.peekHeader(bytes);
  const end = byteLength + header.initialBlockSize;
  const paddingBytes = 64;
  const probe = new Uint8Array(end + paddingBytes + 2);
  probe.set(bytes.subarray(0, end));
  probe.fill(0xff, end, end + paddingBytes);
  probe.set([0x03, 0x00], end + paddingBytes);
  new DataView(probe.buffer).setUint32(
    byteLength - 4,
    header.initialBlockSize + paddingBytes,
    true,
  );
  let padded: InitialBlockData;
  try {
    padded = (await new DemoParser(probe).load()).initialBlock;
  } catch {
    invalid();
  }
  if (
    padded.phase2Error ||
    padded.initialEvents.some((event) => event.failed) ||
    padded.phase2TrailingBits !== trailing + paddingBytes * 8
  )
    invalid();
}

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
    recordedAtRaw: info.recordingDate,
    mission: info.missionDisplayName ?? "",
    mod: info.mod ?? "",
    gameType: info.missionType ?? "",
    tournamentMode: info.tournamentMode,
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
  options: { strict?: boolean } = {},
): Promise<DemoMetadata> {
  return (await analyzeDemoRecording(bytes, filename, options)).metadata;
}

/**
 * Tag-less names for every authenticated GUID in a recording: the initial
 * roster plus every later join, across renames. Private; never published.
 */
export async function readDemoNamesByGuid(
  bytes: Uint8Array,
  filename: string,
): Promise<Record<string, string[]>> {
  return (await analyzeDemoRecording(bytes, filename)).namesByGuid;
}

/**
 * `analyzeDemo`, plus the mission loaded when recording began (what the live
 * recorder names its files after), even if that match never started, and the
 * private GUID names kept apart from the published metadata.
 */
export async function analyzeDemoRecording(
  bytes: Uint8Array,
  filename: string,
  options: { strict?: boolean } = {},
): Promise<{
  metadata: DemoMetadata;
  startMission: string;
  namesByGuid: Record<string, string[]>;
}> {
  const parser = new DemoParser(bytes);
  const { header, initialBlock } = await parser.load();
  const info = parseDemoHeader(initialBlock.demoValues);
  if (options.strict) {
    await validateUploadInitialState(bytes, initialBlock);
    if (
      !info.recordedAt ||
      !info.recordedAtRaw ||
      !validHeaderDate(info.recordedAtRaw, info.recordedAt)
    )
      throw new DemoUploadValidationError(
        "The recording does not contain a valid recording date.",
      );
    // Retail dates have no timezone; allow the full range of current offsets.
    if (Date.parse(info.recordedAt) > Date.now() + 24 * 60 * 60_000)
      throw new DemoUploadValidationError(
        "The recording date is in the future.",
      );
  }

  const initialRoster = parseDemoValues(initialBlock.demoValues).playerRoster;
  const watchState = new WatchStateAccumulator(initialRoster);
  // Relay headers use 0 as an unknown client ID. Retail mid-match demos
  // have already missed the welcome join, so later joins cannot identify self.
  const recorderClientId =
    info.recorderClientId != null && info.recorderClientId > 0
      ? info.recorderClientId
      : null;
  watchState.selfClientId = recorderClientId;
  // Recorded before the mission loaded (relay: from connect or the end of
  // the handshake, whose roster can already hold players who joined
  // during it): the stream carries the datablocks and the welcome join.
  const beforeMission = initialBlock.dataBlocks.size === 0;
  for (const [id, value] of initialBlock.taggedStrings) {
    watchState.netStrings.set(id, value);
  }

  const players = new DemoPlayers(info.recorder);
  const samplePlayers = () =>
    players.sample(
      watchState.getPlayerRoster(),
      recorderClientId ?? (beforeMission ? watchState.selfClientId : null),
    );
  samplePlayers();
  const games: DemoGame[] = [];
  const pendingGame = (
    mission: string,
    startMs: number,
    missionSequence?: number,
  ): DemoGame => ({
    mission,
    missionSequence,
    gameType: "",
    startMs,
    tournament: false,
  });
  // The mission in progress but not yet confirmed started; promoted to
  // `games` the moment the match starts (MsgMissionStart or a running
  // clock). Warmup-only missions are listed only if no match started.
  // || (not ??): the parser initializes missionName to "" and only
  // fills it when the initial block's phase-2 parse succeeds.
  const firstMission = initialBlock.missionName || info.mission;
  let pending: DemoGame | null = firstMission
    ? {
        ...pendingGame(firstMission, 0),
        gameType: info.gameType,
        // The recording header can retain mode learned before recording began.
        // Zero is also a legacy writer default; only a positive flag is evidence.
        // Keep it on this initial game, rather than leaking it into later maps.
        tournament: info.tournamentMode === true,
      }
    : null;
  const unstarted: DemoGame[] = [];
  // The most recent promoted game, patchable while its mission is still
  // current (its MsgLoadInfo type may arrive after the match starts).
  let lastGame: DemoGame | null = null;
  let currentMission = pending?.mission ?? null;
  // A recording from before the mission loaded replays MissionStartPhase1
  // for the mission the initial block already seeded — ignore that one
  // repeat only, so a later back-to-back rematch on the same map still
  // opens a new game. A retail mid-match demo's first Phase1 is always a
  // new match.
  let awaitingSeedPhase1 = pending !== null && beforeMission;
  let moveTicks = 0;
  const MOVE_TICK_MS = 32;

  const sampleGame = () => {
    if (pending) {
      pending.gameType = watchState.missionType || pending.gameType;
      pending.tournament ||= watchState.tournamentMode ?? false;
    }
    if (pending && watchState.matchStarted) {
      lastGame = {
        ...pending,
        tournament: watchState.tournamentMode ?? pending.tournament,
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
  };

  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    if (block.index % 1024 === 0) await setImmediate();
    if (options.strict && block.parseError)
      throw new DemoUploadValidationError(
        `The recording contains a decoding error at block ${block.index}.`,
      );
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
      throw options.strict
        ? new DemoUploadValidationError(
            `The recording contains an unsupported or corrupt packet at block ${block.index}.`,
          )
        : new Error(
            `Block ${block.index}: ${parsed.parseFault.stage}: ${parsed.parseFault.message}`,
          );
    // Apply boundaries and sample games in wire order: the next event in this
    // packet can start a match, provide metadata, or load another mission.
    watchState.applyPacket(parsed, samplePlayers, (name, args) => {
      if (name === "MissionStartPhase1" && args[1]) {
        const mission = args[1];
        const missionSequence = parseMissionSequence(args[0]);
        if (awaitingSeedPhase1 && mission === currentMission) {
          if (pending) pending.missionSequence = missionSequence;
          else if (lastGame) lastGame.missionSequence = missionSequence;
        } else {
          if (pending) unstarted.push(pending);
          watchState.beginMissionChange();
          currentMission = mission;
          pending = pendingGame(
            mission,
            moveTicks * MOVE_TICK_MS,
            missionSequence,
          );
          lastGame = null;
        }
        awaitingSeedPhase1 = false;
      }
      sampleGame();
    });

    samplePlayers();
  }

  if (
    options.strict &&
    parser.createCheckpoint().blockStreamOffset !==
      parser.decompressedByteLength
  )
    throw new DemoUploadValidationError("The recording ends inside a block.");

  // A recording where no match started still lists the map(s) it was on.
  if (!games.length) games.push(...unstarted, ...(pending ? [pending] : []));
  if (options.strict && !games.length)
    throw new DemoUploadValidationError(
      "The recording does not show which map it was recorded on.",
    );

  const metadata: DemoMetadata = {
    filename,
    bytes: bytes.length,
    recordedAt:
      info.recordedAt ??
      parseFilenameDate(filename) ??
      new Date(0).toISOString(),
    ...(options.strict && {
      recordedAtRaw: info.recordedAtRaw!,
      recordedAtTimezone: "unknown" as const,
    }),
    // The stream is authoritative: the server names itself via
    // MsgMissionDropInfo/MsgLoadInfo during the recording, overriding
    // whatever the recorder baked into $DemoValues at flush time.
    server: watchState.serverName ?? info.server,
    address: info.address,
    games,
    mod: info.mod,
    recorder: info.recorder,
    durationMs: options.strict ? moveTicks * MOVE_TICK_MS : header.demoLengthMs,
    // The recorder's original keep-trigger (patrol/watchers) isn't in the
    // .rec; describe what the replay reconstructed instead.
    reason: `backfilled: ${players.count} players, ${games.length} game${games.length === 1 ? "" : "s"}`,
    ...players.metadata(),
  };
  return {
    metadata,
    startMission: firstMission || games[0]?.mission || "",
    namesByGuid: players.namesByGuid(),
  };
}

function validHeaderDate(raw: string, parsed: string): boolean {
  const match =
    /^([A-Z][a-z]{2})-(\d{1,2})-(\d{4}) (\d{1,2}):(\d{2})(AM|PM)$/.exec(
      raw.trim(),
    );
  if (!match) return false;
  const hours = Number(match[4]);
  const date = new Date(parsed);
  return (
    hours >= 1 &&
    hours <= 12 &&
    Number(match[5]) <= 59 &&
    date.getUTCFullYear() === Number(match[3]) &&
    date.getUTCDate() === Number(match[2])
  );
}
