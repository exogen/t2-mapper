/**
 * CastGenius's OWN chat-log event scanner.
 *
 * The app has a timeline scanner (demoTimelineScanner) that curates
 * events for the seek bar — an app feature with app editorial rules
 * (observer recordings keep only flag/match events; the pub kill feed
 * is filtered as timeline noise). Cast generation is a different
 * product with different needs: it wants EVERY kill, positioned and
 * attributed, exactly when the server announced it. So it parses the
 * server-message stream itself, deliberately duplicating the message
 * tables rather than sharing the app's — the two scanners may drift
 * apart on purpose.
 *
 * The server's chat log is the ground truth and is timestamped at the
 * moment of the kill/flag touch itself — there is no "attribution
 * lag" at this layer.
 */
import type { ServerMessageEvent } from "./types";
import { stripTaggedStringMarkup } from "./streamHelpers";
import type { DirectorEvent } from "../director/types";

/**
 * Death message types where args[2]=victimName, args[5]=killerName,
 * args[9]=DamageTypeText (case-insensitive; args arrive netstring-
 * resolved). Explicit Ctrl+K suicide is `msgSuicide` — excluded.
 */
const KILL_MSG_TYPES = new Set([
  "msglegitkill",
  "msgheadshotkill",
  "msgminedisckill",
  "msgrearshotkill",
  "msgteamkill",
  "msgselfkill",
  "msgexplosionkill",
  "msgvehiclekill",
  "msgvehiclecrash",
  "msgvehiclespawnkill",
  "msgturretkill",
  "msgcturretkill",
  "msgturretselfkill",
  "msgoobkill",
  "msgcampkill",
  "msgrogueminekill",
  "msglavakill",
  "msglightningkill",
]);

/** The subset where the victim did it to themselves — a death, not a
 *  credited kill (the booth cares about the difference too). */
const SELF_INFLICTED_MSG_TYPES = new Set([
  "msgselfkill",
  "msgturretselfkill",
  "msgvehiclecrash",
  "msgvehiclespawnkill",
  "msgoobkill",
  "msglavakill",
  "msglightningkill",
  "msgcampkill",
]);

/** "Match started!" from DefaultGame::startMatch — the real kickoff,
 *  not the countdown ticks that share MsgMissionStart. */
function isRealMatchStart(rawBody: string): boolean {
  return stripTaggedStringMarkup(rawBody)
    .toLowerCase()
    .includes("match started");
}

const clean = (value: string | undefined): string =>
  stripTaggedStringMarkup(value ?? "").trim();

/** TorqueScript's empty is "0" on the wire. */
const emptyish = (value: string): string | undefined =>
  value && value !== "0" ? value : undefined;

/**
 * Parse one raw server message into director events (usually 0 or 1).
 * Args arrive netstring-resolved but with markup intact.
 */
export function scanDirectorEvent(event: ServerMessageEvent): DirectorEvent[] {
  const msgType = clean(event.msgType).toLowerCase();
  const { args, timeSec } = event;

  if (KILL_MSG_TYPES.has(msgType) && args.length >= 6) {
    const victim = clean(args[2]);
    const killer = clean(args[5]);
    const weapon = args.length >= 10 ? emptyish(clean(args[9])) : undefined;
    if (!victim) return [];
    const selfInflicted =
      SELF_INFLICTED_MSG_TYPES.has(msgType) ||
      (!!killer && killer.toLowerCase() === victim.toLowerCase());
    if (selfInflicted || !killer) {
      return [
        {
          timeSec,
          type: "death",
          description: `${victim} died`,
          victim,
          weapon,
        },
      ];
    }
    return [
      {
        timeSec,
        type: "kill",
        description: `${killer} killed ${victim}`,
        killer,
        victim,
        weapon,
      },
    ];
  }

  // Flag events. Wire layouts (verified against real demos):
  // taken/dropped/returned: args[2]=playerName ("0"=none),
  // args[3]=teamName ("0"=none); capped: args[2]=capturer,
  // args[3]=teamName.
  if (msgType === "msgctfflagtaken" && args.length >= 3) {
    const actor = emptyish(clean(args[2]));
    const flagTeamName =
      args.length >= 4 ? emptyish(clean(args[3])) : undefined;
    return [
      {
        timeSec,
        type: "flag-grab",
        description: `${actor ?? "Somebody"} grabbed the ${flagTeamName ?? "enemy"} flag`,
        actor,
        flagTeamName,
      },
    ];
  }
  if (msgType === "msgctfflagdropped" && args.length >= 3) {
    const actor = emptyish(clean(args[2]));
    const flagTeamName =
      args.length >= 4 ? emptyish(clean(args[3])) : undefined;
    return [
      {
        timeSec,
        type: "flag-drop",
        description: actor
          ? `${actor} dropped the ${flagTeamName ?? "enemy"} flag`
          : `The ${flagTeamName ?? ""} flag was dropped`.replace("  ", " "),
        actor,
        flagTeamName,
      },
    ];
  }
  if (msgType === "msgctfflagreturned" && args.length >= 3) {
    const actor = emptyish(clean(args[2]));
    const flagTeamName =
      args.length >= 4 ? emptyish(clean(args[3])) : undefined;
    return [
      {
        timeSec,
        type: "flag-return",
        description: actor
          ? `${actor} returned the ${flagTeamName ?? ""} flag`.replace(
              "  ",
              " ",
            )
          : `The ${flagTeamName ?? ""} flag was returned`.replace("  ", " "),
        actor,
        flagTeamName,
      },
    ];
  }
  if (msgType === "msgctfflagcapped" && args.length >= 3) {
    const capturer = emptyish(clean(args[2]));
    const flagTeamName =
      args.length >= 4 ? emptyish(clean(args[3])) : undefined;
    return [
      {
        timeSec,
        type: "flag-cap",
        description:
          `${capturer ?? "Somebody"} captured the ${flagTeamName ?? ""} flag`.replace(
            "  ",
            " ",
          ),
        capturer,
        flagTeamName,
      },
    ];
  }

  if (msgType === "msgmissionstart") {
    const body = clean(args[1]);
    if (isRealMatchStart(body)) {
      return [{ timeSec, type: "match-start", description: "Match started" }];
    }
    // The pre-kickoff countdown shares this message type: "Match
    // starts in N seconds." — the broadcast's natural cue to run the
    // roster line-ups. It arrives BOTH ways on real servers: the long
    // ticks as a template ("Match starts in %1 seconds." + the number
    // in args[2]), the final ticks pre-substituted.
    const direct = /match starts in (\d+) second/i.exec(body);
    const secondsUntil = direct
      ? parseInt(direct[1], 10)
      : /match starts in %1 second/i.test(body)
        ? parseInt(clean(args[2]), 10)
        : NaN;
    if (Number.isFinite(secondsUntil)) {
      return [
        {
          timeSec,
          type: "match-countdown",
          description: `Match starts in ${secondsUntil} seconds`,
          secondsUntil,
        },
      ];
    }
    return [];
  }
  if (msgType === "msggameover") {
    return [{ timeSec, type: "match-end", description: "Match ended" }];
  }
  return [];
}
