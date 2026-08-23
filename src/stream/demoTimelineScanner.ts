import { BlockTypeMove, BlockTypePacket, DemoParser } from "t2-demo-parser";
import type {
  ParsedData,
  NetStringEventData,
  RemoteCommandEventData,
} from "t2-demo-parser";
import { TICK_DURATION_MS } from "./entityClassification";
import {
  extractWavTag,
  resolveNetString,
  formatRemoteArgs,
  stripTaggedStringMarkup,
} from "./streamHelpers";
import type { TimelineEvent } from "../state/demoTimelineStore";
import { createLogger } from "../logger";

const log = createLogger("demoTimelineScanner");

/** Yield control every N blocks to keep the UI responsive. */
const YIELD_INTERVAL = 500;

/**
 * `MsgMissionStart` is overloaded: the server broadcasts it for every
 * pre-match countdown tick ("Match starts in N seconds", from
 * `notifyMatchStart`) as well as the real kickoff ("Match started!" from
 * `DefaultGame::startMatch`, or an admin force). Only the kickoff belongs
 * on the timeline, distinguished here by the message body.
 *
 * This also handles a cancelled countdown for free: `CancelCountdown`
 * sends clients no message, so a cancelled (then restarted) countdown
 * never produces a kickoff body until the match truly starts — the entry
 * lands at the moment the map actually starts, not when a since-aborted
 * countdown first began.
 */
export function isRealMatchStart(rawBody: string): boolean {
  const body = stripTaggedStringMarkup(rawBody).toLowerCase();
  return (
    body.includes("match started") ||
    body.includes("forced the match to start")
  );
}

/**
 * All death message types where args[2]=victimName, args[5]=killerName,
 * args[9]=DamageTypeText. Case-insensitive matching is used.
 *
 * Note: explicit suicide (Ctrl+K) uses `msgSuicide` which is NOT in
 * this set — we intentionally ignore those.
 */
const KILL_MSG_TYPES = new Set([
  // Player-vs-player kills
  "msglegitkill",
  "msgheadshotkill",
  "msgteamkill",
  // Self-inflicted (own weapon damage, cratering)
  "msgselfkill",
  // Explosions (can be self or other)
  "msgexplosionkill",
  // Vehicle-related
  "msgvehiclekill",
  "msgvehiclecrash",
  "msgvehiclespawnkill",
  // Turret-related
  "msgturretkill",
  "msgcturretkill",
  "msgturretselfkill",
  // Environmental
  "msgoobkill",
  "msgcampkill",
  "msgrogueminekill",
  "msglavakill",
  "msglightningkill",
]);

/**
 * Death message types where the victim killed themselves (own weapon,
 * cratering, environmental hazards). These are NOT credited as kills
 * but ARE shown as deaths. Does NOT include explicit Ctrl+K suicide
 * (which is `msgSuicide`, not in KILL_MSG_TYPES at all).
 */
const SELF_INFLICTED_MSG_TYPES = new Set([
  "msgselfkill", // Own weapon damage or cratering ($DamageType::Ground)
  "msgturretselfkill", // Own turret
  "msgvehiclecrash", // Vehicle crash
  "msgvehiclespawnkill", // Crushed by vehicle spawning
  "msgoobkill", // Out of bounds
  "msglavakill", // Lava
  "msglightningkill", // Lightning
  "msgcampkill", // Nexus camping
]);

/** Descriptions for self-inflicted deaths by message type.
 *  Used for environmental deaths where the msg type alone is sufficient. */
const SELF_INFLICTED_DESCRIPTIONS: Record<string, string> = {
  msgoobkill: "Out of bounds",
  msglavakill: "Killed by lava",
  msglightningkill: "Struck by lightning",
  msgcampkill: "Nexus camping",
  msgturretselfkill: "Killed by own turret",
  msgvehiclecrash: "Vehicle crash",
  msgvehiclespawnkill: "Crushed by vehicle",
};

/** Display names for $DamageTypeText values that need formatting. */
const WEAPON_DISPLAY_NAMES: Record<string, string> = {
  turret: "base turret",
  "plasma turret": "plasma turret",
  "aa turret": "AA turret",
  "elf turret": "ELF turret",
  "mortar turret": "mortar turret",
  "missile turret": "missile turret",
  "clamp turret": "indoor deployable turret",
  "spike turret": "outdoor deployable turret",
  "sentry turret": "sentry turret",
  "shrike blaster": "Shrike",
  "belly turret": "Havoc belly turret",
  "bomber bomb": "bomber",
  "tank chaingun": "tank chaingun",
  "tank mortar": "tank mortar",
  "mpb missile": "MPB missile",
  forcefield: "force field",
  impact: "vehicle impact",
  crash: "vehicle crash",
  explosion: "explosion",
};

/** Descriptions for msgselfkill deaths by $DamageTypeText (args[9]).
 *  The msg type is the same for cratering AND own-weapon deaths, so
 *  the damage type text is needed to distinguish them. */
const SELF_KILL_BY_WEAPON: Record<string, string> = {
  ground: "Cratered",
  mine: "Killed by own mine",
  satchelcharge: "Killed by own satchel",
  grenade: "Killed by own grenade",
  mortar: "Killed by own mortar",
  disc: "Killed by own disc",
  plasma: "Killed by own plasma",
  blaster: "Killed by own blaster",
  missile: "Killed by own missile",
  explosion: "Killed by explosion",
};

/**
 * A message template formatted for timeline display: the shared
 * formatRemoteArgs plus dropping the embedded `~w<path>` sound cue many
 * templates end with, and trimming.
 */
function formatEventDescription(
  template: string,
  args: string[],
  netStrings: Map<number, string>,
): string {
  return extractWavTag(
    formatRemoteArgs(template, args, netStrings),
  ).text.trim();
}

export interface TimelineScanResult {
  events: TimelineEvent[];
  /**
   * True when the recorder never played (relay auto-capture, spectator
   * recording) — kill and death events are never emitted for these.
   */
  observerPerspective: boolean;
}

/**
 * Scan an entire demo recording for timeline events (kills, flag caps,
 * match start). Yields to the event loop periodically to stay responsive.
 */
export async function scanDemoTimeline(
  buffer: ArrayBuffer,
  recorderName: string | null,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<TimelineScanResult> {
  const parser = new DemoParser(new Uint8Array(buffer));
  const { initialBlock } = await parser.load();

  const netStrings = new Map<number, string>();
  for (const [id, value] of initialBlock.taggedStrings) {
    netStrings.set(id, value);
  }

  const registry = parser.getRegistry();
  const normalizedRecorder = recorderName
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
  // Get initial team from PLAYERLIST in demoValues.
  if (recorderClientId != null) {
    const dv = initialBlock.demoValues;
    // PLAYERLIST starts after MISC (1 value): idx 1 is playerCount.
    const playerCount =
      parseInt(dv[1] === "<BLANK>" ? "0" : (dv[1] ?? "0"), 10) || 0;
    for (let i = 0; i < playerCount; i++) {
      const fields = (dv[2 + i] ?? "").split("\t");
      const cid = parseInt(fields[2], 10);
      if (cid === recorderClientId) {
        const tid = parseInt(fields[4], 10);
        if (!isNaN(tid)) recorderTeamId = tid;
        break;
      }
    }
  }

  // "Observer" means the recorder was NEVER on a team — a full-match
  // first-person demo often ENDS at teamId 0 (mission-cycle rejoin), so
  // the current team at any single moment is not the signal.
  let recorderEverOnTeam = recorderTeamId != null && recorderTeamId > 0;

  const events: TimelineEvent[] = [];
  let moveTicks = 0;
  let seenMatchStart = false;
  let currentMissionName: string | null = null;
  let blockCount = 0;
  const totalBlocks = parser.blockCount;

  while (true) {
    if (signal?.aborted) break;

    let block;
    try {
      block = parser.nextBlock();
    } catch (err) {
      // Parser cursor state is unknown after a throw — stop scanning and
      // return whatever events we've found rather than risking an infinite loop.
      log.warn(
        "Stopping scan at block %d due to read error: %o",
        blockCount,
        err,
      );
      break;
    }
    if (!block) break;
    blockCount++;

    if (block.type === BlockTypeMove) {
      moveTicks++;
      continue;
    }

    if (block.type !== BlockTypePacket || !block.parsed) continue;

    const packet = block.parsed as {
      events?: Array<{
        classId: number;
        parsedData?: ParsedData;
      }>;
    };
    if (!packet.events) continue;

    const timeSec = moveTicks * (TICK_DURATION_MS / 1000);

    for (const evt of packet.events) {
      try {
        if (!evt.parsedData) continue;
        const type = evt.parsedData.type as string | undefined;

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
        const eventName = registry.getEventParser(evt.classId)?.name;
        if (
          type !== "RemoteCommandEvent" &&
          eventName !== "RemoteCommandEvent"
        ) {
          continue;
        }

        const rcData = evt.parsedData as RemoteCommandEventData;
        const funcName = resolveNetString(rcData.funcName, netStrings);
        if (funcName !== "ServerMessage") continue;

        const args = rcData.args;
        if (!args || args.length < 2) continue;

        const msgType = resolveNetString(args[0], netStrings);
        const msgTypeLower = msgType.toLowerCase();

        // Track recorder's team changes.
        if (
          msgTypeLower === "msgclientjointeam" &&
          recorderClientId != null &&
          args.length >= 6
        ) {
          const clientId = parseInt(resolveNetString(args[4], netStrings), 10);
          if (clientId === recorderClientId) {
            const teamId = parseInt(resolveNetString(args[5], netStrings), 10);
            if (!isNaN(teamId)) {
              recorderTeamId = teamId;
              if (teamId > 0 && !recorderEverOnTeam) {
                recorderEverOnTeam = true;
                // The recorder turned out to be a player: drop the
                // everyone's-events collected under observer rules so the
                // whole timeline follows first-person rules (on team 0
                // until now, the recorder had no own events to lose).
                for (let i = events.length - 1; i >= 0; i--) {
                  const e = events[i];
                  if (
                    (e.type === "flag-grab" || e.type === "flag-return") &&
                    e.teamAffinity === "neutral"
                  ) {
                    events.splice(i, 1);
                  }
                }
              }
            }
          }
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
          if (
            !seenMatchStart &&
            isRealMatchStart(resolveNetString(args[1] ?? "", netStrings))
          ) {
            seenMatchStart = true;
            const suffix = currentMissionName ? ` (${currentMissionName})` : "";
            events.push({
              timeSec,
              type: "match-start",
              description: `Match started${suffix}`,
            });
          }
          continue;
        }

        // Match ended.
        if (msgTypeLower === "msggameover") {
          const suffix = currentMissionName ? ` (${currentMissionName})` : "";
          events.push({
            timeSec,
            type: "match-end",
            description: `Match ended${suffix}`,
          });
          // Reset for the next match in the same demo.
          seenMatchStart = false;
          continue;
        }

        // An observer recording (relay auto-capture, or a spectator's
        // demo): the recorder never plays, so recorder-relative
        // filtering would drop every kill, grab, and return — include
        // everyone's events from a neutral perspective instead.
        const isObserverPerspective = !recorderEverOnTeam;

        // Flag grab (taken from base).
        // Wire: args[2]=playerName, args[3]=teamName, args[4]=flag.team, args[5]=playerNameBase
        if (msgTypeLower === "msgctfflagtaken" && args.length >= 3) {
          const playerName = stripTaggedStringMarkup(
            resolveNetString(args[2], netStrings),
          ).trim();
          const flagTeamName =
            args.length >= 4
              ? stripTaggedStringMarkup(
                  resolveNetString(args[3], netStrings),
                ).trim()
              : undefined;
          if (isObserverPerspective) {
            events.push({
              timeSec,
              type: "flag-grab",
              description: `${playerName} grabbed the ${flagTeamName ?? "enemy"} flag`,
              teamAffinity: "neutral",
              actor: playerName || undefined,
              flagTeamName: flagTeamName || undefined,
            });
          } else if (
            normalizedRecorder &&
            playerName.toLowerCase() === normalizedRecorder
          ) {
            // Only include grabs by the control player (recorder).
            events.push({
              timeSec,
              type: "flag-grab",
              description: `You took the ${flagTeamName ?? "enemy"} flag`,
              teamAffinity: "friendly",
              flagTeamName: flagTeamName || undefined,
            });
          }
          continue;
        }

        // Flag return (returned to base).
        // Wire: args[2]=playerName, args[3]=teamName, args[4]=flag.team
        if (msgTypeLower === "msgctfflagreturned" && args.length >= 3) {
          const playerName = stripTaggedStringMarkup(
            resolveNetString(args[2], netStrings),
          ).trim();
          if (isObserverPerspective) {
            const flagTeamName =
              args.length >= 4
                ? stripTaggedStringMarkup(
                    resolveNetString(args[3], netStrings),
                  ).trim()
                : undefined;
            const flagLabel = flagTeamName
              ? `the ${flagTeamName} flag`
              : "the flag";
            // "0" is TorqueScript's empty: the flag timed out to base.
            const actor =
              playerName && playerName !== "0" ? playerName : undefined;
            events.push({
              timeSec,
              type: "flag-return",
              description: actor
                ? `${actor} returned ${flagLabel}`
                : `${flagLabel.replace(/^the/, "The")} was returned`,
              teamAffinity: "neutral",
              actor,
              flagTeamName: flagTeamName || undefined,
            });
          } else if (
            normalizedRecorder &&
            playerName.toLowerCase() === normalizedRecorder
          ) {
            // Only include returns by the control player (recorder).
            events.push({
              timeSec,
              type: "flag-return",
              description: "You returned your flag",
              teamAffinity: "friendly",
            });
          }
          continue;
        }

        // Flag capture.
        // Wire: args[2]=capturerName, args[3]=teamName, args[4]=flag.team, args[5]=capturer.team
        if (msgTypeLower === "msgctfflagcapped" && args.length >= 2) {
          const description = formatEventDescription(
            args[1],
            args.slice(2),
            netStrings,
          );
          const capturerName =
            args.length >= 3
              ? stripTaggedStringMarkup(
                  resolveNetString(args[2], netStrings),
                ).trim()
              : undefined;
          const flagTeamName =
            args.length >= 4
              ? stripTaggedStringMarkup(
                  resolveNetString(args[3], netStrings),
                ).trim()
              : undefined;
          let teamAffinity: "friendly" | "enemy" | "neutral" = "neutral";
          if (
            recorderTeamId != null &&
            recorderTeamId > 0 &&
            args.length >= 6
          ) {
            const capturerTeam = parseInt(
              resolveNetString(args[5], netStrings),
              10,
            );
            if (capturerTeam === recorderTeamId) {
              teamAffinity = "friendly";
            } else if (!isNaN(capturerTeam)) {
              teamAffinity = "enemy";
            }
          }
          events.push({
            timeSec,
            type: "flag-cap",
            description: description || "Flag captured",
            teamAffinity,
            capturer: capturerName,
            flagTeamName: flagTeamName || undefined,
          });
          continue;
        }

        // Kill/death messages.
        if (KILL_MSG_TYPES.has(msgTypeLower) && args.length >= 6) {
          // args[2]=victimName, args[5]=killerName, args[9]=DamageTypeText
          const killerName = stripTaggedStringMarkup(
            resolveNetString(args[5], netStrings),
          ).trim();
          const victimName = stripTaggedStringMarkup(
            resolveNetString(args[2], netStrings),
          ).trim();
          const weapon =
            args.length >= 10
              ? stripTaggedStringMarkup(
                  resolveNetString(args[9], netStrings),
                ).trim()
              : undefined;

          // Observer recordings keep only flag and match events —
          // other players' kills and deaths are noise at timeline
          // scale (Ctrl+K suicides are already excluded globally).
          if (!isObserverPerspective && normalizedRecorder) {
            const normalizedKiller = killerName.toLowerCase();
            const normalizedVictim = victimName.toLowerCase();
            const isSelfInflicted = SELF_INFLICTED_MSG_TYPES.has(msgTypeLower);

            // Kills: recorder killed someone else (not self-inflicted).
            if (
              !isSelfInflicted &&
              normalizedKiller === normalizedRecorder &&
              normalizedVictim !== normalizedRecorder
            ) {
              const description = formatEventDescription(
                args[1],
                args.slice(2),
                netStrings,
              );
              events.push({
                timeSec,
                type: "kill",
                description: description || `${killerName} got a kill`,
                killer: killerName,
                victim: victimName,
                weapon: weapon || undefined,
              });
            }

            // Deaths: recorder is the victim.
            if (normalizedVictim === normalizedRecorder) {
              if (isSelfInflicted) {
                // Self-inflicted: cratering, own weapon, environmental.
                // For msgselfkill, use the weapon text to distinguish
                // (e.g. "ground" = cratered, "mine" = own mine).
                const msgDescription =
                  SELF_INFLICTED_DESCRIPTIONS[msgTypeLower];
                const weaponDescription =
                  msgTypeLower === "msgselfkill" && weapon
                    ? SELF_KILL_BY_WEAPON[weapon.toLowerCase()]
                    : undefined;
                events.push({
                  timeSec,
                  type: "death",
                  description: msgDescription ?? weaponDescription ?? "Died",
                  weapon: weapon || undefined,
                });
              } else if (
                normalizedKiller !== normalizedRecorder &&
                killerName
              ) {
                // Killed by another player or controlled turret.
                events.push({
                  timeSec,
                  type: "death",
                  description: `Killed by ${killerName}`,
                  killer: killerName,
                  victim: victimName,
                  weapon: weapon || undefined,
                });
              } else {
                // No killer name (base turret, explosion, etc.) or
                // self-inflicted on a non-self-inflicted msg type
                // (e.g. msgexplosionkill where killer === victim).
                const weaponLower = weapon?.toLowerCase();
                events.push({
                  timeSec,
                  type: "death",
                  description: weapon
                    ? `Killed by ${WEAPON_DISPLAY_NAMES[weaponLower!] ?? weapon}`
                    : "Died",
                  weapon: weapon || undefined,
                });
              }
            }
          }
        }
      } catch (err) {
        log.warn("Skipping malformed event in block %d: %o", blockCount, err);
      }
    }

    // Yield control periodically.
    if (blockCount % YIELD_INTERVAL === 0) {
      if (totalBlocks && onProgress) {
        onProgress(Math.min(blockCount / totalBlocks, 1));
      }
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  log.info("Scanned %d blocks, found %d events", blockCount, events.length);
  return {
    events,
    observerPerspective: !recorderEverOnTeam,
  };
}
