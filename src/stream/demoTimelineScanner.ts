import {
  BlockTypeMove,
  BlockTypePacket,
  type DemoParser,
} from "t2-demo-parser";
import type {
  NetStringEventData,
  RemoteCommandEventData,
  PacketData,
} from "t2-demo-parser";
import {
  TICK_DURATION_MS,
  resolveNetString,
  formatServerMessageText,
  stripTaggedStringMarkup,
} from "./streamHelpers";
import { KILL_MSG_TYPES, SELF_INFLICTED_MSG_TYPES } from "./serverMessages";
import type { TeamAffinity, TimelineEvent } from "../state/demoTimelineStore";
import { GhostMessage } from "./entityClassification";
import { createLogger } from "../logger";
import { hasGameOverAnnouncement, isRealMatchStart } from "./matchEvents";
import { assertDemoBlockParsed } from "./demoParseError";
import { loadDemoParser } from "./loadDemoParser";
import { GeneratorTimeline } from "./generatorTimeline";
import { parseDemoValues } from "./demoStreaming";
import {
  applyServerMessageState,
  type ServerMessageRosterEntry,
  type ServerMessageTeamScore,
} from "../../relay/serverMessageState";
import {
  getServerNameFromMessage,
  isServerMessageCommand,
} from "../../relay/serverMessageDecode";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { timelineDeathAction } from "./demoTimelineCombatText";

const log = createLogger("demoTimelineScanner");

/** How long the scan may hold the event loop before yielding. */
const YIELD_SLICE_MS = 8;
const METADATA_MESSAGE_TYPES: Record<string, string> = {
  msgclientjoin: "MsgClientJoin",
  msgclientdrop: "MsgClientDrop",
  msgclientjointeam: "MsgClientJoinTeam",
  msgclientnamechanged: "MsgClientNameChanged",
  msgctfaddteam: "MsgCTFAddTeam",
};

type FlagAction = "grab" | "drop" | "return" | "cap";
const FLAG_MESSAGE_ACTIONS: Record<string, FlagAction> = {
  msgctfflagtaken: "grab",
  msgctfflagdropped: "drop",
  msgctfflagreturned: "return",
  msgctfflagcapped: "cap",
};
const FLAG_ACTION_VERBS: Record<FlagAction, string> = {
  grab: "grabbed",
  drop: "dropped",
  return: "returned",
  cap: "captured",
};

/** Flag messages use both empty strings and "0" for omitted names. */
function flagMessageName(raw: string): string | undefined {
  const name = stripTaggedStringMarkup(raw).trim();
  return name && name !== "0" ? name : undefined;
}

/**
 * An admin force or a passed start vote: the countdown is beginning,
 * which can still be cancelled before the actual kickoff.
 */
function isCountdownForced(rawBody: string): boolean {
  const body = stripTaggedStringMarkup(rawBody).toLowerCase();
  return (
    body.includes("forced the match to start") ||
    body.includes("started by vote")
  );
}

export interface TimelineScanResult {
  events: TimelineEvent[];
}

/**
 * Scan an entire demo recording for timeline events (kills, flag caps,
 * generator state, match start). Yields periodically to stay responsive.
 */
export async function scanDemoTimeline(
  buffer: ArrayBuffer,
  recorderName: string | null,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
  onServerName?: (name: string) => void,
): Promise<TimelineScanResult> {
  signal?.throwIfAborted();
  const parser = await loadDemoParser(new Uint8Array(buffer));
  return scanDemoTimelineParser(
    parser,
    recorderName,
    onProgress,
    signal,
    onServerName,
  );
}

/** Consume a parser that can be reset for replay, sharing its decompressed data. */
export async function scanDemoTimelineParser(
  parser: DemoParser,
  recorderName: string | null,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
  onServerName?: (name: string) => void,
): Promise<TimelineScanResult> {
  signal?.throwIfAborted();
  const { initialBlock } = await parser.load();
  signal?.throwIfAborted();

  const netStrings = new Map<number, string>();
  for (const [id, value] of initialBlock.taggedStrings) {
    netStrings.set(id, value);
  }

  const registry = parser.getRegistry();
  const parsedDemoValues = parseDemoValues(initialBlock.demoValues);
  const rosterState = {
    flags: new Map(parsedDemoValues.flags.map((flag) => [flag.teamId, flag])),
    playerIdentity: { scope: "demo", generations: new Map<number, number>() },
    playerRoster: new Map<number, ServerMessageRosterEntry>(
      parsedDemoValues.playerRoster,
    ),
    teamScores: parsedDemoValues.teamScores.map((team) => ({
      ...team,
    })) as ServerMessageTeamScore[],
  };
  const generators = new GeneratorTimeline(
    initialBlock,
    netStrings,
    parsedDemoValues.teamScores,
    (classId) => registry.getGhostParser(classId)?.name,
  );
  let recorderRawName = recorderName;
  let normalizedRecorder = recorderName
    ? stripTaggedStringMarkup(recorderName).trim().toLowerCase()
    : null;

  // Extract recorder's clientId and initial team from demoValues.
  let recorderClientId: number | null = null;
  let recorderTeamId: number | null = null;
  for (let i = 0; i < initialBlock.demoValues.length; i++) {
    if (initialBlock.demoValues[i] !== "readplayerinfo") continue;
    const value = initialBlock.demoValues[i + 1];
    if (value?.startsWith("1\t")) {
      const fields = value.split("\t");
      const cid = parseInt(fields[1], 10);
      if (Number.isFinite(cid)) recorderClientId = cid;
      break;
    }
  }
  // Stock recordings lack PJ recorder metadata. An inferred control-player
  // name identifies a client only when exactly one initial roster row matches.
  if (recorderClientId == null && normalizedRecorder) {
    let matchingClientId: number | null = null;
    for (const [clientId, entry] of parsedDemoValues.playerRoster) {
      if (entry.name.toLowerCase() !== normalizedRecorder) continue;
      if (matchingClientId != null) {
        matchingClientId = null;
        break;
      }
      matchingClientId = clientId;
    }
    recorderClientId = matchingClientId;
  }

  // Get initial team and full tagged name from the same parsed roster.
  if (recorderClientId != null) {
    const entry = parsedDemoValues.playerRoster.get(recorderClientId);
    if (entry) {
      // PJ metadata may contain only the base name, while messages use
      // the full tagged name. The client ID identifies the roster row.
      if (entry.name) {
        normalizedRecorder = entry.name.toLowerCase();
        recorderRawName = entry.rawName;
      }
      recorderTeamId = entry.teamId;
    }
  }

  let events: TimelineEvent[] = [];
  // Generator credit may arrive later; match against the recorder's name
  // when the transition happened, not their final name after a rename/rejoin.
  const generatorRecorders = new Map<TimelineEvent, string | null>();
  /** Forced-start/vote countdowns, used only if no kickoff ever lands. */
  const forcedStarts: TimelineEvent[] = [];
  let moveTicks = 0;
  let seenMatchStart = false;
  let matchBoundary = 0;
  let currentMissionName: string | null = null;
  let blockCount = 0;
  let serverNameFound = false;
  let sliceStart = performance.now();
  const totalBlocks = parser.blockCount;

  function flagEvent(
    action: FlagAction,
    args: string[],
    timeSec: number,
  ): TimelineEvent {
    let actorRaw = resolveNetString(args[2] ?? "", netStrings);
    let actor = flagMessageName(actorRaw);
    const template = stripTaggedStringMarkup(
      resolveNetString(args[1] ?? "", netStrings),
    ).trim();
    // Own returns/drops/captures can omit the actor. "Your flag..." also
    // occurs on automatic returns, so match "You" as a whole word.
    const ownAction = !actor && /^you\b/i.test(template);
    if (ownAction) {
      actorRaw = recorderRawName ?? "";
      actor = flagMessageName(actorRaw);
    }
    const isRecorder = ownAction || actor?.toLowerCase() === normalizedRecorder;
    const parseTeam = (arg: string | undefined) => {
      const parsed =
        arg == null ? NaN : parseInt(resolveNetString(arg, netStrings), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    // All four messages carry the flag's team in args[4]. Only captures
    // carry the actor's team in args[5]; grabs use that slot for a name.
    const flagTeamId = parseTeam(args[4]);
    const flagTeamName =
      flagMessageName(resolveNetString(args[3] ?? "", netStrings)) ??
      (flagTeamId != null && flagTeamId > 0
        ? flagMessageName(
            rosterState.teamScores.find((team) => team.teamId === flagTeamId)
              ?.name ?? "",
          )
        : undefined);
    const matches = actor
      ? [...rosterState.playerRoster.values()].filter(
          (entry) => entry.name.toLowerCase() === actor.toLowerCase(),
        )
      : [];
    const rosterTeam =
      matches.length === 1 && matches[0].teamId > 0
        ? matches[0].teamId
        : undefined;
    // Captures carry the action owner's team explicitly. Otherwise prefer
    // the event-time roster, then the recorder's team for their own action.
    // Stock two-team CTF: grabs/drops/caps belong to the opposing team;
    // returns (including automatic returns) belong to the flag's owner.
    const actorTeamId =
      (action === "cap" ? parseTeam(args[5]) : undefined) ??
      rosterTeam ??
      (isRecorder && recorderTeamId != null && recorderTeamId > 0
        ? recorderTeamId
        : undefined) ??
      (action === "return"
        ? flagTeamId
        : flagTeamId === 1
          ? 2
          : flagTeamId === 2
            ? 1
            : undefined);
    const teamAffinity: TeamAffinity =
      recorderTeamId == null ||
      recorderTeamId <= 0 ||
      actorTeamId == null ||
      actorTeamId <= 0
        ? "neutral"
        : actorTeamId === recorderTeamId
          ? "friendly"
          : "enemy";
    const actorTeamName =
      actorTeamId != null && actorTeamId > 0
        ? stripTaggedStringMarkup(
            rosterState.teamScores.find((team) => team.teamId === actorTeamId)
              ?.name ?? "",
          ).trim() ||
          DEFAULT_TEAM_NAMES[actorTeamId] ||
          `Team ${actorTeamId}`
        : undefined;
    const originalMessage = formatServerMessageText(args, netStrings);
    const verb = FLAG_ACTION_VERBS[action];
    const flagLabel = flagTeamName
      ? `the ${flagTeamName} flag`
      : action === "grab"
        ? "the enemy flag"
        : "the flag";
    return {
      timeSec,
      type: `flag-${action}`,
      description:
        action === "cap"
          ? (originalMessage ?? "Flag captured")
          : actor
            ? `${actor} ${verb} ${flagLabel}`
            : `The ${flagTeamName ? `${flagTeamName} ` : ""}flag was ${verb}`,
      originalMessage,
      isRecorder,
      flagTeamId,
      flagTeamName,
      actorTeamId,
      actorTeamName,
      teamAffinity,
      ...(action === "cap"
        ? { capturer: actor, raw: actor ? { capturer: actorRaw } : undefined }
        : { actor, raw: actor ? { actor: actorRaw } : undefined }),
    };
  }

  while (true) {
    signal?.throwIfAborted();

    const block = parser.nextBlock();
    if (!block) break;
    assertDemoBlockParsed(block, moveTicks * (TICK_DURATION_MS / 1000));
    blockCount++;

    if (block.type === BlockTypeMove) {
      moveTicks++;
      continue;
    }

    if (block.type !== BlockTypePacket || !block.parsed) continue;

    const packet = block.parsed as Partial<
      Pick<PacketData, "events" | "ghosts">
    >;

    const timeSec = moveTicks * (TICK_DURATION_MS / 1000);

    for (const evt of packet.events ?? []) {
      try {
        if (!evt.parsedData) continue;
        const type = evt.parsedData.type as string | undefined;
        const eventName = registry.getEventParser(evt.classId)?.name;
        generators.event(evt.parsedData, type ?? eventName, timeSec);
        if (
          type === "GhostingMessageEvent" &&
          evt.parsedData.message === GhostMessage.EndGhosting
        ) {
          seenMatchStart = false;
          matchBoundary = events.length;
          currentMissionName = null;
          continue;
        }

        if (type === "NetStringEvent") {
          const nsData = evt.parsedData as NetStringEventData;
          const id = nsData.id;
          const value = nsData.value;
          if (value != null) {
            netStrings.set(id, value);
          }
          continue;
        }

        // Also check the registry name for RemoteCommandEvent identification.
        if (
          type !== "RemoteCommandEvent" &&
          eventName !== "RemoteCommandEvent"
        ) {
          continue;
        }

        const rcData = evt.parsedData as RemoteCommandEventData;
        const funcName = resolveNetString(rcData.funcName, netStrings);
        if (!isServerMessageCommand(funcName)) continue;

        const args = rcData.args;
        if (!args?.length) continue;

        const msgType = resolveNetString(args[0], netStrings);
        const msgTypeLower = msgType.toLowerCase();
        if (args.length < 2 && msgTypeLower !== "msgctfflagcapped") continue;
        const metadataMessage = METADATA_MESSAGE_TYPES[msgTypeLower];
        if (metadataMessage) {
          applyServerMessageState(
            metadataMessage,
            args,
            (arg) => resolveNetString(arg, netStrings),
            rosterState,
          );
        }
        if (
          onServerName &&
          !serverNameFound &&
          (msgType === "MsgLoadInfo" || msgType === "MsgMissionDropInfo")
        ) {
          const serverName = getServerNameFromMessage(
            args.map((arg) => resolveNetString(arg, netStrings)),
          );
          if (serverName) {
            serverNameFound = true;
            // Publish immediately: a later corrupt block must not discard
            // independently decoded metadata from the playable prefix.
            onServerName(serverName);
          }
        }
        generators.serverMessage(
          msgType,
          args,
          timeSec,
          funcName.toLowerCase() === "teamdestroymessage"
            ? recorderTeamId
            : null,
          recorderClientId != null &&
            recorderTeamId != null &&
            recorderTeamId > 0
            ? { rawName: recorderRawName ?? "", teamId: recorderTeamId }
            : undefined,
        );

        // From-connect recordings can start before the roster exists. Only
        // the recorder's own welcome message identifies its connection;
        // silent roster joins and other players' welcomes cannot supply it.
        if (
          recorderClientId == null &&
          normalizedRecorder &&
          msgTypeLower === "msgclientjoin" &&
          args.length >= 4
        ) {
          const rawName = resolveNetString(args[2], netStrings);
          const name = stripTaggedStringMarkup(rawName).trim().toLowerCase();
          const format = stripTaggedStringMarkup(
            resolveNetString(args[1], netStrings),
          );
          const clientId = parseInt(resolveNetString(args[3], netStrings), 10);
          if (
            !rawName.startsWith("\x01") &&
            name === normalizedRecorder &&
            format.includes("Welcome to Tribes") &&
            Number.isFinite(clientId)
          ) {
            recorderClientId = clientId;
          }
        }

        // Keep the recorder's message identity current across tag changes
        // and map rejoins, without conflating other players with the same
        // base name.
        if (recorderClientId != null) {
          const identity =
            msgTypeLower === "msgclientjoin"
              ? [args[3], args[2]]
              : msgTypeLower === "msgclientjointeam"
                ? [args[4], args[2]]
                : msgTypeLower === "msgclientnamechanged"
                  ? [args[4], args[3]]
                  : null;
          if (
            identity?.[0] &&
            parseInt(resolveNetString(identity[0], netStrings), 10) ===
              recorderClientId &&
            identity[1]
          ) {
            const rawName = resolveNetString(identity[1], netStrings);
            const name = stripTaggedStringMarkup(rawName).trim();
            if (name) {
              normalizedRecorder = name.toLowerCase();
              recorderRawName = rawName;
            }
          }
        }

        // The shared roster handles joins, drops and team changes in wire
        // order. Read it instead of retaining a team across a roster reset.
        if (recorderClientId != null) {
          recorderTeamId =
            rosterState.playerRoster.get(recorderClientId)?.teamId ?? null;
        }

        // Track current mission name from server info messages.
        if (msgTypeLower === "msgmissiondropinfo" && args.length >= 3) {
          // Wire: args[2]=$MissionDisplayName
          const name = stripTaggedStringMarkup(
            resolveNetString(args[2], netStrings),
          ).trim();
          if (name) currentMissionName = name;
        }
        if (msgTypeLower === "msgloadinfo" && args.length >= 4) {
          // Wire: args[2]=$CurrentMission, args[3]=$MissionDisplayName
          const name = stripTaggedStringMarkup(
            resolveNetString(args[3], netStrings),
          ).trim();
          if (name) currentMissionName = name;
        }

        // Match start. Ignore the pre-match countdown ticks that share
        // this message type — only the real kickoff (or a cancelled-then-
        // restarted countdown's eventual kickoff) should land on the
        // timeline, so key off the message body rather than the mere
        // arrival of a MsgMissionStart. See isRealMatchStart.
        if (msgTypeLower === "msgmissionstart") {
          const body = resolveNetString(args[1] ?? "", netStrings);
          const suffix = currentMissionName ? ` (${currentMissionName})` : "";
          if (!seenMatchStart && isRealMatchStart(body)) {
            // A recorded kickoff proves the preceding period was warmup.
            // Keep player kills, but omit spawn-selection/self deaths. Without
            // a kickoff, the recording may instead have begun mid-match.
            events = events.filter(
              (event, index) => index < matchBoundary || event.type !== "death",
            );
            seenMatchStart = true;
            events.push({
              timeSec,
              type: "match-start",
              description: `Match started${suffix}`,
              originalMessage: formatServerMessageText(args, netStrings),
              isRecorder: false,
            });
          } else if (!seenMatchStart && isCountdownForced(body)) {
            forcedStarts.push({
              timeSec,
              type: "match-countdown",
              description: `Countdown started${suffix}`,
              originalMessage: formatServerMessageText(args, netStrings),
              isRecorder: false,
            });
          }
          continue;
        }

        // Match ended.
        if (
          msgTypeLower === "msggameover" &&
          hasGameOverAnnouncement(resolveNetString(args[1], netStrings))
        ) {
          const suffix = currentMissionName ? ` (${currentMissionName})` : "";
          events.push({
            timeSec,
            type: "match-end",
            description: `Match ended${suffix}`,
            originalMessage: formatServerMessageText(args, netStrings),
            isRecorder: false,
          });
          // Reset for the next match in the same demo.
          seenMatchStart = false;
          matchBoundary = events.length;
          continue;
        }

        // A player changed their name — the community tag-change script
        // (TacoServer dtChatCmdGame.cs). Wire: args[2]=old name,
        // args[3]=new name, args[4]=clientId. The reconnect restore
        // sends the same name twice; that is not a change.
        if (msgTypeLower === "msgclientnamechanged" && args.length >= 5) {
          const previousRaw = resolveNetString(args[2], netStrings);
          const newRaw = resolveNetString(args[3], netStrings);
          const previousName = stripTaggedStringMarkup(previousRaw).trim();
          const newName = stripTaggedStringMarkup(newRaw).trim();
          if (newName && previousName !== newName) {
            events.push({
              timeSec,
              type: "rename",
              description: `${previousName || "A player"} is now ${newName}`,
              originalMessage: formatServerMessageText(args, netStrings),
              isRecorder:
                parseInt(resolveNetString(args[4], netStrings), 10) ===
                recorderClientId,
              teamAffinity: "neutral",
              actor: newName,
              previousName: previousName || undefined,
              raw: { actor: newRaw, previousName: previousRaw || undefined },
            });
          }
          continue;
        }

        const flagAction = FLAG_MESSAGE_ACTIONS[msgTypeLower];
        if (flagAction && (args.length >= 3 || flagAction === "cap")) {
          events.push(flagEvent(flagAction, args, timeSec));
          continue;
        }

        // A player kill is also a death; retain one event with both identities
        // so selecting both categories never duplicates the incident.
        if (
          (KILL_MSG_TYPES.has(msgTypeLower) || msgTypeLower === "msgsuicide") &&
          args.length >= 3
        ) {
          const killerRaw = resolveNetString(args[5] ?? "", netStrings);
          const victimRaw = resolveNetString(args[2], netStrings);
          const killerName = stripTaggedStringMarkup(killerRaw).trim();
          const victimName = stripTaggedStringMarkup(victimRaw).trim();
          // The server chooses this from the character's sex when they die,
          // including for players whose body is outside our ghost scope.
          const pronoun = resolveNetString(args[3] ?? "", netStrings)
            .trim()
            .toLowerCase();
          const victimPronoun =
            pronoun === "him" || pronoun === "her" ? pronoun : undefined;
          const weaponText =
            args.length >= 10
              ? stripTaggedStringMarkup(
                  resolveNetString(args[9], netStrings),
                ).trim()
              : undefined;
          const weapon =
            weaponText?.toLowerCase() === "default" ? undefined : weaponText;
          const isSelfInflicted =
            SELF_INFLICTED_MSG_TYPES.has(msgTypeLower) ||
            msgTypeLower === "msgsuicide";
          const victimIsRecorder =
            victimName.toLowerCase() === normalizedRecorder;
          const originalMessage = formatServerMessageText(args, netStrings);
          if (
            !isSelfInflicted &&
            killerName &&
            victimName &&
            killerName.toLowerCase() !== victimName.toLowerCase()
          ) {
            events.push({
              timeSec,
              type: "kill",
              description:
                originalMessage ?? `${killerName} killed ${victimName}`,
              originalMessage,
              isRecorder: killerName.toLowerCase() === normalizedRecorder,
              victimIsRecorder,
              killer: killerName,
              victim: victimName,
              victimPronoun,
              weapon: weapon || undefined,
              raw: { killer: killerRaw, victim: victimRaw },
            });
          } else {
            const weaponLower = weapon?.toLowerCase();
            const selfKill =
              !!weapon &&
              weaponLower !== "ground" &&
              (msgTypeLower === "msgselfkill" ||
                msgTypeLower === "msgturretselfkill" ||
                (!isSelfInflicted &&
                  !!killerName &&
                  killerName.toLowerCase() === victimName.toLowerCase()));
            const death = {
              deathMessage: msgTypeLower,
              victimPronoun,
              selfKill,
              weapon: weapon || undefined,
            } satisfies Partial<TimelineEvent>;
            events.push({
              timeSec,
              type: "death",
              description: `${victimName || "A player"} ${timelineDeathAction(death)}`,
              originalMessage,
              isRecorder: victimIsRecorder,
              victim: victimName || undefined,
              ...death,
              raw: victimName ? { victim: victimRaw } : undefined,
            });
          }
        }
      } catch (err) {
        log.warn("Skipping malformed event in block %d: %o", blockCount, err);
      }
    }

    for (const event of generators.packet(
      packet.ghosts ?? [],
      timeSec,
      recorderTeamId,
    )) {
      events.push(event);
      generatorRecorders.set(event, normalizedRecorder);
    }

    // Yield the event loop once a slice of wall time has gone by —
    // by time, not by block count, so a stretch of heavy blocks cannot
    // hold the page for longer than a frame's worth of work.
    if (performance.now() - sliceStart >= YIELD_SLICE_MS) {
      if (totalBlocks && onProgress) {
        onProgress(Math.min(blockCount / totalBlocks, 1));
      }
      await new Promise<void>((r) => setTimeout(r, 0));
      sliceStart = performance.now();
    }
  }

  generators.finish();
  for (const [event, recorder] of generatorRecorders) {
    event.isRecorder = event.actor?.toLowerCase() === recorder;
  }

  // An unfinished forced countdown is useful context, but never a kickoff.
  if (
    forcedStarts.length > 0 &&
    !events.some((e) => e.type === "match-start")
  ) {
    events.push(forcedStarts[0]);
    events.sort((a, b) => a.timeSec - b.timeSec);
  }

  log.info("Scanned %d blocks, found %d events", blockCount, events.length);
  return {
    events,
  };
}
