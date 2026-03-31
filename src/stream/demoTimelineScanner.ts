import { BlockTypeMove, BlockTypePacket, DemoParser } from "t2-demo-parser";
import { TICK_DURATION_MS } from "./entityClassification";
import { stripTaggedStringMarkup } from "./streamHelpers";
import type { TimelineEvent } from "../state/demoTimelineStore";
import { createLogger } from "../logger";

const log = createLogger("demoTimelineScanner");

/** Yield control every N blocks to keep the UI responsive. */
const YIELD_INTERVAL = 500;

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

function resolveNetString(s: string, netStrings: Map<number, string>): string {
  if (s.length >= 2 && s.charCodeAt(0) === 1) {
    const id = parseInt(s.slice(1), 10);
    if (Number.isFinite(id)) return netStrings.get(id) ?? s;
  }
  return s;
}

function formatRemoteArgs(
  template: string,
  args: string[],
  netStrings: Map<number, string>,
): string {
  let resolved = resolveNetString(template, netStrings);
  for (let i = 0; i < args.length; i++) {
    const placeholder = `%${i + 1}`;
    if (resolved.includes(placeholder)) {
      resolved = resolved.replaceAll(
        placeholder,
        stripTaggedStringMarkup(resolveNetString(args[i], netStrings)),
      );
    }
  }
  resolved = resolved.replace(/%\d+/g, "");
  return stripTaggedStringMarkup(resolved);
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
): Promise<TimelineEvent[]> {
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

  const events: TimelineEvent[] = [];
  let moveTicks = 0;
  let seenMatchStart = false;
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
        parsedData?: Record<string, unknown>;
      }>;
    };
    if (!packet.events) continue;

    const timeSec = moveTicks * (TICK_DURATION_MS / 1000);

    for (const evt of packet.events) {
      try {
        if (!evt.parsedData) continue;
        const type = evt.parsedData.type as string | undefined;

        if (type === "NetStringEvent") {
          const id = evt.parsedData.id as number;
          const value = evt.parsedData.value as string | undefined;
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

        const funcName = resolveNetString(
          evt.parsedData.funcName as string,
          netStrings,
        );
        if (funcName !== "ServerMessage") continue;

        const args = evt.parsedData.args as string[];
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
            if (!isNaN(teamId)) recorderTeamId = teamId;
          }
        }

        // Match start: MsgMissionStart is sent when the match actually begins
        // (after the countdown). MsgSystemClock is just the countdown timer.
        if (msgTypeLower === "msgmissionstart" && !seenMatchStart) {
          seenMatchStart = true;
          events.push({
            timeSec,
            type: "match-start",
            description: "Match started",
          });
          continue;
        }

        // Match ended.
        if (msgTypeLower === "msggameover") {
          events.push({
            timeSec,
            type: "match-end",
            description: "Match ended",
          });
          continue;
        }

        // Flag grab (taken from base).
        // Wire: args[2]=playerName, args[3]=teamName, args[4]=flag.team, args[5]=playerNameBase
        if (msgTypeLower === "msgctfflagtaken" && args.length >= 3) {
          const playerName = stripTaggedStringMarkup(
            resolveNetString(args[2], netStrings),
          ).trim();
          // Only include grabs by the control player (recorder).
          if (
            normalizedRecorder &&
            playerName.toLowerCase() === normalizedRecorder
          ) {
            const flagTeamName =
              args.length >= 4
                ? stripTaggedStringMarkup(
                    resolveNetString(args[3], netStrings),
                  ).trim()
                : undefined;
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
          // Only include returns by the control player (recorder).
          if (
            normalizedRecorder &&
            playerName.toLowerCase() === normalizedRecorder
          ) {
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
          const description = formatRemoteArgs(
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

          if (normalizedRecorder) {
            const normalizedKiller = killerName.toLowerCase();
            const normalizedVictim = victimName.toLowerCase();
            const isSelfInflicted = SELF_INFLICTED_MSG_TYPES.has(msgTypeLower);

            // Kills: recorder killed someone else (not self-inflicted).
            if (
              !isSelfInflicted &&
              normalizedKiller === normalizedRecorder &&
              normalizedVictim !== normalizedRecorder
            ) {
              const description = formatRemoteArgs(
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
  return events;
}
